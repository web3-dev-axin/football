// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract ConditionalTokensLite {
    uint256 public constant MAX_OUTCOME_COUNT = 16;

    struct Condition {
        bytes32 questionId;
        uint256 outcomeSlotCount;
        bool prepared;
        bool resolved;
        uint256[] payoutNumerators;
        uint256 payoutDenominator;
    }

    address public owner;
    mapping(bytes32 => Condition) private conditions;
    mapping(address => bool) public markets;
    mapping(uint256 => mapping(address => uint256)) public balanceOf;

    event ConditionPrepared(bytes32 indexed conditionId, bytes32 indexed questionId, uint256 outcomeSlotCount);
    event PositionSplit(bytes32 indexed conditionId, address indexed user, uint256 indexed outcomeIndex, uint256 amount);
    event PositionMerged(bytes32 indexed conditionId, address indexed user, uint256 indexed outcomeIndex, uint256 amount);
    event PayoutReported(bytes32 indexed conditionId, uint256[] payoutNumerators, uint256 payoutDenominator);
    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);

    error NotOwner();
    error NotMarket();
    error ConditionAlreadyPrepared();
    error ConditionNotPrepared();
    error InvalidOutcomeCount();
    error InvalidPayoutVector();
    error InsufficientShares();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyMarket() {
        if (!markets[msg.sender]) revert NotMarket();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    function setMarket(address market, bool allowed) external onlyOwner {
        markets[market] = allowed;
    }

    function prepareCondition(bytes32 questionId, uint256 outcomeSlotCount) external onlyOwner returns (bytes32 conditionId) {
        if (outcomeSlotCount < 2 || outcomeSlotCount > MAX_OUTCOME_COUNT) revert InvalidOutcomeCount();
        conditionId = getConditionId(questionId, outcomeSlotCount);
        if (conditions[conditionId].prepared) revert ConditionAlreadyPrepared();
        conditions[conditionId].questionId = questionId;
        conditions[conditionId].outcomeSlotCount = outcomeSlotCount;
        conditions[conditionId].prepared = true;
        emit ConditionPrepared(conditionId, questionId, outcomeSlotCount);
    }

    function mintPosition(address user, bytes32 conditionId, uint256 outcomeIndex, uint256 amount) external onlyMarket {
        _requirePreparedOutcome(conditionId, outcomeIndex);
        uint256 tokenId = getPositionId(conditionId, outcomeIndex);
        balanceOf[tokenId][user] += amount;
        emit PositionSplit(conditionId, user, outcomeIndex, amount);
        emit TransferSingle(msg.sender, address(0), user, tokenId, amount);
    }

    function burnPosition(address user, bytes32 conditionId, uint256 outcomeIndex, uint256 amount) external onlyMarket {
        _requirePreparedOutcome(conditionId, outcomeIndex);
        uint256 tokenId = getPositionId(conditionId, outcomeIndex);
        if (balanceOf[tokenId][user] < amount) revert InsufficientShares();
        balanceOf[tokenId][user] -= amount;
        emit PositionMerged(conditionId, user, outcomeIndex, amount);
        emit TransferSingle(msg.sender, user, address(0), tokenId, amount);
    }

    function reportPayouts(bytes32 conditionId, uint256[] calldata payoutNumerators) external onlyMarket {
        Condition storage condition = conditions[conditionId];
        if (!condition.prepared) revert ConditionNotPrepared();
        if (payoutNumerators.length != condition.outcomeSlotCount) revert InvalidPayoutVector();
        uint256 denominator;
        for (uint256 i = 0; i < payoutNumerators.length; i++) {
            denominator += payoutNumerators[i];
        }
        if (denominator == 0) revert InvalidPayoutVector();
        condition.resolved = true;
        condition.payoutNumerators = payoutNumerators;
        condition.payoutDenominator = denominator;
        emit PayoutReported(conditionId, payoutNumerators, denominator);
    }

    function getCondition(bytes32 conditionId) external view returns (bytes32 questionId, uint256 outcomeSlotCount, bool prepared, bool resolved, uint256 payoutDenominator) {
        Condition storage condition = conditions[conditionId];
        return (condition.questionId, condition.outcomeSlotCount, condition.prepared, condition.resolved, condition.payoutDenominator);
    }

    function getConditionId(bytes32 questionId, uint256 outcomeSlotCount) public pure returns (bytes32) {
        return keccak256(abi.encode(questionId, outcomeSlotCount));
    }

    function getPositionId(bytes32 conditionId, uint256 outcomeIndex) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(conditionId, outcomeIndex)));
    }

    function _requirePreparedOutcome(bytes32 conditionId, uint256 outcomeIndex) internal view {
        Condition storage condition = conditions[conditionId];
        if (!condition.prepared) revert ConditionNotPrepared();
        if (outcomeIndex >= condition.outcomeSlotCount) revert InvalidOutcomeCount();
    }
}
