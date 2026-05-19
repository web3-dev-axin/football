// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {WorldCupMarket} from "./WorldCupMarket.sol";

contract OptimisticResultOracle {
    struct ResultPayload {
        bytes32 marketId;
        uint8 winningOutcome;
        int16 homeScore;
        int16 awayScore;
        bytes32 dataSourceHash;
        string evidenceUri;
    }

    struct Proposal {
        address market;
        address proposer;
        uint8 winningOutcome;
        bytes32 payloadHash;
        uint256 challengeDeadline;
        bool challenged;
        bool finalized;
        string evidenceUri;
    }

    address public owner;
    uint256 public immutable challengeWindowSeconds;
    mapping(bytes32 => Proposal) public proposals;

    event ResultProposed(bytes32 indexed marketId, bytes32 indexed proposalId, address indexed proposer, uint8 winningOutcome, bytes32 payloadHash, uint256 challengeDeadline);
    event ResultChallenged(bytes32 indexed marketId, address indexed challenger, string reason, string evidenceUri);
    event ResultFinalized(bytes32 indexed marketId, uint8 winningOutcome, uint256[] payoutNumerators, uint256 payoutDenominator);
    event MarketVoided(bytes32 indexed marketId, address indexed market);

    error NotOwner();
    error InvalidOutcome();
    error ProposalExists();
    error ProposalMissing();
    error ChallengeWindowOpen();
    error ChallengeWindowClosed();
    error ProposalChallenged();
    error AlreadyFinalized();

    constructor(uint256 challengeWindowSeconds_) {
        owner = msg.sender;
        challengeWindowSeconds = challengeWindowSeconds_;
    }

    function proposeResult(address market, ResultPayload calldata payload) external returns (bytes32 proposalId) {
        if (payload.winningOutcome > 1) revert InvalidOutcome();
        Proposal storage existing = proposals[payload.marketId];
        if (existing.market != address(0)) revert ProposalExists();
        bytes32 payloadHash = keccak256(abi.encode(payload.marketId, payload.winningOutcome, payload.homeScore, payload.awayScore, payload.dataSourceHash, payload.evidenceUri));
        uint256 challengeDeadline = block.timestamp + challengeWindowSeconds;
        proposals[payload.marketId] = Proposal({
            market: market,
            proposer: msg.sender,
            winningOutcome: payload.winningOutcome,
            payloadHash: payloadHash,
            challengeDeadline: challengeDeadline,
            challenged: false,
            finalized: false,
            evidenceUri: payload.evidenceUri
        });
        WorldCupMarket(market).markResultProposed();
        proposalId = keccak256(abi.encode(payload.marketId, payloadHash));
        emit ResultProposed(payload.marketId, proposalId, msg.sender, payload.winningOutcome, payloadHash, challengeDeadline);
    }

    function challenge(bytes32 marketId, string calldata reason, string calldata evidenceUri) external {
        Proposal storage proposal = proposals[marketId];
        if (proposal.market == address(0)) revert ProposalMissing();
        if (proposal.finalized) revert AlreadyFinalized();
        if (block.timestamp > proposal.challengeDeadline) revert ChallengeWindowClosed();
        proposal.challenged = true;
        WorldCupMarket(proposal.market).markChallenged();
        emit ResultChallenged(marketId, msg.sender, reason, evidenceUri);
    }

    function finalize(bytes32 marketId) external {
        Proposal storage proposal = proposals[marketId];
        if (proposal.market == address(0)) revert ProposalMissing();
        if (proposal.finalized) revert AlreadyFinalized();
        if (proposal.challenged) revert ProposalChallenged();
        if (block.timestamp < proposal.challengeDeadline) revert ChallengeWindowOpen();
        proposal.finalized = true;
        WorldCupMarket(proposal.market).finalizeResult(proposal.winningOutcome);
        uint256[] memory payouts = new uint256[](2);
        payouts[proposal.winningOutcome] = 1;
        emit ResultFinalized(marketId, proposal.winningOutcome, payouts, 1);
    }

    function adminResolve(bytes32 marketId, uint8 winningOutcome) external {
        if (msg.sender != owner) revert NotOwner();
        if (winningOutcome > 1) revert InvalidOutcome();
        Proposal storage proposal = proposals[marketId];
        if (proposal.market == address(0)) revert ProposalMissing();
        if (proposal.finalized) revert AlreadyFinalized();
        proposal.finalized = true;
        proposal.winningOutcome = winningOutcome;
        WorldCupMarket(proposal.market).finalizeResult(winningOutcome);
        uint256[] memory payouts = new uint256[](2);
        payouts[winningOutcome] = 1;
        emit ResultFinalized(marketId, winningOutcome, payouts, 1);
    }

    function voidMarket(address market, bytes32 marketId) external {
        if (msg.sender != owner) revert NotOwner();
        WorldCupMarket(market).voidMarket();
        emit MarketVoided(marketId, market);
    }
}
