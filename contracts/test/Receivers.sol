// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IDuoSafe {
    function execute(uint256 proposalId) external;
}

/// @dev Test-only recipient that refuses every payment.
contract RejectingReceiver {
    receive() external payable {
        revert("no thanks");
    }
}

/// @dev Test-only owner and recipient that tries to execute the same proposal again
///      from inside the transfer.
contract ReentrantReceiver {
    IDuoSafe public immutable safe;
    uint256 public proposalId;

    constructor(address safeAddress) {
        safe = IDuoSafe(safeAddress);
    }

    function setProposal(uint256 id) external {
        proposalId = id;
    }

    receive() external payable {
        safe.execute(proposalId);
    }
}
