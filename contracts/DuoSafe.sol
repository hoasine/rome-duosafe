// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title DuoSafe
/// @notice Shared USDC safes on Rome whose co-signers can be EVM wallets or Solana wallets.
///         Every payment needs `threshold` approvals from the safe's owners.
/// @dev Solana owners are added by public key. Rome derives a Solana wallet's EVM caller as
///      the last 20 bytes of keccak256(pubkey), so the contract stores that synthetic address
///      as the owner and the wallet approves from Solflare without an EVM key.
///      Funds for every safe live in this one contract; `totalHeld` always equals the sum of
///      safe balances and the contract's native balance never falls below it.
contract DuoSafe {
    uint256 public constant MAX_OWNERS = 10;
    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 public constant MAX_MEMO_BYTES = 140;
    uint64 public constant PROPOSAL_LIFETIME = 30 days;
    uint256 public constant MAX_PAGE_SIZE = 25;

    uint8 private constant KIND_NONE = 0;
    uint8 private constant KIND_EVM = 1;
    uint8 private constant KIND_SOLANA = 2;

    enum Status {
        Pending,
        Executed,
        Cancelled
    }

    struct Safe {
        string name;
        uint8 threshold;
        uint64 createdAt;
        uint256 balance;
        address[] owners;
    }

    struct SafeView {
        uint256 id;
        string name;
        uint8 threshold;
        uint64 createdAt;
        uint256 balance;
        address[] owners;
        bool[] solanaOwners;
        bytes32[] solanaPubkeys;
        uint256 proposalCount;
    }

    struct Proposal {
        uint256 safeId;
        address proposer;
        address to;
        uint256 amount;
        string memo;
        uint64 createdAt;
        uint64 expiresAt;
        uint8 approvals;
        Status status;
    }

    struct ProposalView {
        uint256 id;
        uint256 safeId;
        address proposer;
        address to;
        uint256 amount;
        string memo;
        uint64 createdAt;
        uint64 expiresAt;
        uint8 approvals;
        Status status;
    }

    error AlreadyApproved();
    error DuplicateOwner();
    error EmptyValue();
    error InsufficientBalance();
    error InvalidAmount();
    error InvalidOwnerCount();
    error InvalidRecipient();
    error InvalidThreshold();
    error LimitTooLarge();
    error NotApproved();
    error NotEnoughApprovals();
    error NotOwner();
    error NotProposer();
    error ProposalClosed();
    error ProposalExpired();
    error ProposalNotFound();
    error ReentrantCall();
    error SafeNotFound();
    error TextTooLong();
    error TransferFailed();

    uint256 public safeCount;
    uint256 public proposalCount;
    uint256 public totalHeld;

    mapping(uint256 => Safe) private _safes;
    mapping(uint256 => mapping(address => uint8)) private _ownerKind;
    mapping(uint256 => mapping(address => bytes32)) private _solanaPubkey;
    mapping(address => uint256[]) private _safesOf;
    mapping(uint256 => Proposal) private _proposals;
    mapping(uint256 => uint256[]) private _proposalsOf;
    mapping(uint256 => mapping(address => bool)) private _approved;
    uint256 private _unlocked = 1;

    event SafeCreated(uint256 indexed safeId, address indexed creator, uint8 threshold, uint256 owners);
    event Deposited(uint256 indexed safeId, address indexed from, uint256 amount);
    event Proposed(uint256 indexed proposalId, uint256 indexed safeId, address indexed proposer, address to, uint256 amount);
    event Approved(uint256 indexed proposalId, address indexed owner);
    event ApprovalRevoked(uint256 indexed proposalId, address indexed owner);
    event Cancelled(uint256 indexed proposalId);
    event Executed(uint256 indexed proposalId, uint256 indexed safeId, address indexed to, uint256 amount);

    modifier nonReentrant() {
        if (_unlocked != 1) revert ReentrantCall();
        _unlocked = 2;
        _;
        _unlocked = 1;
    }

    function createSafe(
        string calldata name,
        address[] calldata evmOwners,
        bytes32[] calldata solanaPubkeys,
        uint8 threshold
    ) external returns (uint256 safeId) {
        if (bytes(name).length == 0) revert EmptyValue();
        if (bytes(name).length > MAX_NAME_BYTES) revert TextTooLong();
        uint256 owners = evmOwners.length + solanaPubkeys.length;
        if (owners == 0 || owners > MAX_OWNERS) revert InvalidOwnerCount();
        if (threshold == 0 || threshold > owners) revert InvalidThreshold();

        safeId = ++safeCount;
        Safe storage safe = _safes[safeId];
        safe.name = name;
        safe.threshold = threshold;
        safe.createdAt = uint64(block.timestamp);

        for (uint256 index; index < evmOwners.length; index++) {
            _addOwner(safeId, evmOwners[index], KIND_EVM, bytes32(0));
        }
        for (uint256 index; index < solanaPubkeys.length; index++) {
            if (solanaPubkeys[index] == bytes32(0)) revert InvalidRecipient();
            _addOwner(safeId, syntheticAddressOf(solanaPubkeys[index]), KIND_SOLANA, solanaPubkeys[index]);
        }
        emit SafeCreated(safeId, msg.sender, threshold, owners);
    }

    function deposit(uint256 safeId) external payable {
        Safe storage safe = _getSafe(safeId);
        if (msg.value == 0) revert InvalidAmount();
        safe.balance += msg.value;
        totalHeld += msg.value;
        emit Deposited(safeId, msg.sender, msg.value);
    }

    function propose(
        uint256 safeId,
        address to,
        uint256 amount,
        string calldata memo
    ) external returns (uint256 proposalId) {
        _getSafe(safeId);
        _requireOwner(safeId);
        if (amount == 0) revert InvalidAmount();
        if (to == address(0) || to == address(this)) revert InvalidRecipient();
        if (bytes(memo).length > MAX_MEMO_BYTES) revert TextTooLong();

        proposalId = ++proposalCount;
        _proposals[proposalId] = Proposal({
            safeId: safeId,
            proposer: msg.sender,
            to: to,
            amount: amount,
            memo: memo,
            createdAt: uint64(block.timestamp),
            expiresAt: uint64(block.timestamp) + PROPOSAL_LIFETIME,
            approvals: 1,
            status: Status.Pending
        });
        _approved[proposalId][msg.sender] = true;
        _proposalsOf[safeId].push(proposalId);
        emit Proposed(proposalId, safeId, msg.sender, to, amount);
        emit Approved(proposalId, msg.sender);
    }

    function approve(uint256 proposalId) external {
        Proposal storage proposal = _getOpenProposal(proposalId);
        _requireOwner(proposal.safeId);
        if (_approved[proposalId][msg.sender]) revert AlreadyApproved();
        _approved[proposalId][msg.sender] = true;
        proposal.approvals++;
        emit Approved(proposalId, msg.sender);
    }

    function revokeApproval(uint256 proposalId) external {
        Proposal storage proposal = _getOpenProposal(proposalId);
        if (!_approved[proposalId][msg.sender]) revert NotApproved();
        _approved[proposalId][msg.sender] = false;
        proposal.approvals--;
        emit ApprovalRevoked(proposalId, msg.sender);
    }

    function cancel(uint256 proposalId) external {
        Proposal storage proposal = _getProposal(proposalId);
        if (proposal.status != Status.Pending) revert ProposalClosed();
        if (proposal.proposer != msg.sender) revert NotProposer();
        proposal.status = Status.Cancelled;
        emit Cancelled(proposalId);
    }

    function execute(uint256 proposalId) external nonReentrant {
        Proposal storage proposal = _getOpenProposal(proposalId);
        _requireOwner(proposal.safeId);
        Safe storage safe = _safes[proposal.safeId];
        if (proposal.approvals < safe.threshold) revert NotEnoughApprovals();
        if (safe.balance < proposal.amount) revert InsufficientBalance();

        proposal.status = Status.Executed;
        safe.balance -= proposal.amount;
        totalHeld -= proposal.amount;
        emit Executed(proposalId, proposal.safeId, proposal.to, proposal.amount);

        (bool success, ) = proposal.to.call{value: proposal.amount}("");
        if (!success) revert TransferFailed();
    }

    function syntheticAddressOf(bytes32 solanaPubkey) public pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(solanaPubkey)))));
    }

    function isOwner(uint256 safeId, address account) external view returns (bool) {
        return _ownerKind[safeId][account] != KIND_NONE;
    }

    function hasApproved(uint256 proposalId, address owner) external view returns (bool) {
        return _approved[proposalId][owner];
    }

    function getSafe(uint256 safeId) public view returns (SafeView memory view_) {
        Safe storage safe = _getSafe(safeId);
        uint256 count = safe.owners.length;
        bool[] memory solanaOwners = new bool[](count);
        bytes32[] memory pubkeys = new bytes32[](count);
        for (uint256 index; index < count; index++) {
            address owner = safe.owners[index];
            solanaOwners[index] = _ownerKind[safeId][owner] == KIND_SOLANA;
            pubkeys[index] = _solanaPubkey[safeId][owner];
        }
        view_ = SafeView({
            id: safeId,
            name: safe.name,
            threshold: safe.threshold,
            createdAt: safe.createdAt,
            balance: safe.balance,
            owners: safe.owners,
            solanaOwners: solanaOwners,
            solanaPubkeys: pubkeys,
            proposalCount: _proposalsOf[safeId].length
        });
    }

    /// @notice Safes that list `owner` as a co-signer, newest first.
    function safesOf(address owner, uint256 offset, uint256 limit) external view returns (SafeView[] memory page) {
        if (limit > MAX_PAGE_SIZE) revert LimitTooLarge();
        uint256[] storage ids = _safesOf[owner];
        if (offset >= ids.length || limit == 0) return new SafeView[](0);
        uint256 size = ids.length - offset;
        if (size > limit) size = limit;
        page = new SafeView[](size);
        for (uint256 index; index < size; index++) {
            page[index] = getSafe(ids[ids.length - 1 - offset - index]);
        }
    }

    function getProposal(uint256 proposalId) public view returns (ProposalView memory) {
        Proposal storage proposal = _getProposal(proposalId);
        return ProposalView({
            id: proposalId,
            safeId: proposal.safeId,
            proposer: proposal.proposer,
            to: proposal.to,
            amount: proposal.amount,
            memo: proposal.memo,
            createdAt: proposal.createdAt,
            expiresAt: proposal.expiresAt,
            approvals: proposal.approvals,
            status: proposal.status
        });
    }

    /// @notice Proposals of a safe, newest first.
    function proposalsOf(
        uint256 safeId,
        uint256 offset,
        uint256 limit
    ) external view returns (ProposalView[] memory page) {
        if (limit > MAX_PAGE_SIZE) revert LimitTooLarge();
        _getSafe(safeId);
        uint256[] storage ids = _proposalsOf[safeId];
        if (offset >= ids.length || limit == 0) return new ProposalView[](0);
        uint256 size = ids.length - offset;
        if (size > limit) size = limit;
        page = new ProposalView[](size);
        for (uint256 index; index < size; index++) {
            page[index] = getProposal(ids[ids.length - 1 - offset - index]);
        }
    }

    function _addOwner(uint256 safeId, address owner, uint8 kind, bytes32 pubkey) private {
        if (owner == address(0) || owner == address(this)) revert InvalidRecipient();
        if (_ownerKind[safeId][owner] != KIND_NONE) revert DuplicateOwner();
        _ownerKind[safeId][owner] = kind;
        _solanaPubkey[safeId][owner] = pubkey;
        _safes[safeId].owners.push(owner);
        _safesOf[owner].push(safeId);
    }

    function _requireOwner(uint256 safeId) private view {
        if (_ownerKind[safeId][msg.sender] == KIND_NONE) revert NotOwner();
    }

    function _getSafe(uint256 safeId) private view returns (Safe storage safe) {
        safe = _safes[safeId];
        if (safe.threshold == 0) revert SafeNotFound();
    }

    function _getProposal(uint256 proposalId) private view returns (Proposal storage proposal) {
        proposal = _proposals[proposalId];
        if (proposal.proposer == address(0)) revert ProposalNotFound();
    }

    function _getOpenProposal(uint256 proposalId) private view returns (Proposal storage proposal) {
        proposal = _getProposal(proposalId);
        if (proposal.status != Status.Pending) revert ProposalClosed();
        if (block.timestamp >= proposal.expiresAt) revert ProposalExpired();
    }
}
