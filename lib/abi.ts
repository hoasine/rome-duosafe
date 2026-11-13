const safeComponents = [
  { name: "id", type: "uint256" },
  { name: "name", type: "string" },
  { name: "threshold", type: "uint8" },
  { name: "createdAt", type: "uint64" },
  { name: "balance", type: "uint256" },
  { name: "owners", type: "address[]" },
  { name: "solanaOwners", type: "bool[]" },
  { name: "solanaPubkeys", type: "bytes32[]" },
  { name: "proposalCount", type: "uint256" },
] as const;

const proposalComponents = [
  { name: "id", type: "uint256" },
  { name: "safeId", type: "uint256" },
  { name: "proposer", type: "address" },
  { name: "to", type: "address" },
  { name: "amount", type: "uint256" },
  { name: "memo", type: "string" },
  { name: "createdAt", type: "uint64" },
  { name: "expiresAt", type: "uint64" },
  { name: "approvals", type: "uint8" },
  { name: "status", type: "uint8" },
] as const;

const proposalIdInput = [{ name: "proposalId", type: "uint256" }] as const;

export const duoSafeAbi = [
  { type: "function", name: "safeCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "proposalCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalHeld", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function",
    name: "createSafe",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "evmOwners", type: "address[]" },
      { name: "solanaPubkeys", type: "bytes32[]" },
      { name: "threshold", type: "uint8" },
    ],
    outputs: [{ name: "safeId", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [{ name: "safeId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "propose",
    stateMutability: "nonpayable",
    inputs: [
      { name: "safeId", type: "uint256" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "memo", type: "string" },
    ],
    outputs: [{ name: "proposalId", type: "uint256" }],
  },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: proposalIdInput, outputs: [] },
  { type: "function", name: "revokeApproval", stateMutability: "nonpayable", inputs: proposalIdInput, outputs: [] },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: proposalIdInput, outputs: [] },
  { type: "function", name: "execute", stateMutability: "nonpayable", inputs: proposalIdInput, outputs: [] },
  {
    type: "function",
    name: "hasApproved",
    stateMutability: "view",
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getSafe",
    stateMutability: "view",
    inputs: [{ name: "safeId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: safeComponents }],
  },
  {
    type: "function",
    name: "safesOf",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ name: "page", type: "tuple[]", components: safeComponents }],
  },
  {
    type: "function",
    name: "getProposal",
    stateMutability: "view",
    inputs: proposalIdInput,
    outputs: [{ name: "", type: "tuple", components: proposalComponents }],
  },
  {
    type: "function",
    name: "proposalsOf",
    stateMutability: "view",
    inputs: [
      { name: "safeId", type: "uint256" },
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ name: "page", type: "tuple[]", components: proposalComponents }],
  },
] as const;
