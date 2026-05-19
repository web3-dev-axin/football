// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockUSDC} from "../src/MockUSDC.sol";
import {ConditionalTokensLite} from "../src/ConditionalTokensLite.sol";
import {OptimisticResultOracle} from "../src/OptimisticResultOracle.sol";
import {WorldCupMarketFactory} from "../src/WorldCupMarketFactory.sol";
import {WorldCupMarket} from "../src/WorldCupMarket.sol";

contract FlowActor {
    function buy(MockUSDC usdc, WorldCupMarket market, uint256 outcomeIndex, uint256 amount) external {
        usdc.approve(address(market), amount);
        market.buy(outcomeIndex, amount, 1);
    }

    function redeem(WorldCupMarket market, uint256 outcomeIndex, uint256 amount) external returns (uint256) {
        return market.redeem(outcomeIndex, amount);
    }

    function refund(WorldCupMarket market, uint256 outcomeIndex, uint256 amount) external returns (uint256) {
        return market.refund(outcomeIndex, amount);
    }
}

contract FullFlow {
    struct Deployment {
        MockUSDC usdc;
        ConditionalTokensLite ctf;
        OptimisticResultOracle oracle;
        WorldCupMarketFactory factory;
    }

    struct FlowResult {
        address market;
        bytes32 marketId;
        bytes32 conditionId;
        uint256 yesRedeemed;
        uint256 noRedeemed;
        uint256 refunded;
        WorldCupMarket.Status finalStatus;
        WorldCupMarket.Status voidStatus;
    }

    function run() external returns (Deployment memory deployment, FlowResult memory result) {
        deployment = deploy();
        result = runWithDeployment(deployment);
    }

    function deploy() public returns (Deployment memory deployment) {
        deployment.usdc = new MockUSDC();
        deployment.ctf = new ConditionalTokensLite();
        deployment.oracle = new OptimisticResultOracle(0);
        deployment.factory = new WorldCupMarketFactory(deployment.usdc, deployment.ctf, address(deployment.oracle));
        deployment.ctf.transferOwnership(address(deployment.factory));
    }

    function runWithDeployment(Deployment memory deployment) public returns (FlowResult memory result) {
        (address marketAddress, bytes32 marketId, bytes32 conditionId) = deployment.factory.createMarket(
            "fixture:demo-2026-001:goal_window:3780:4380:full-flow-finalize",
            "demo-2026-001",
            3780,
            4380,
            block.timestamp + 300,
            keccak256("goal-in-window"),
            2
        );
        WorldCupMarket market = WorldCupMarket(marketAddress);
        FlowActor finalizingActor = new FlowActor();
        deployment.usdc.mint(address(finalizingActor), 200_000_000);
        finalizingActor.buy(deployment.usdc, market, 0, 100_000_000);
        finalizingActor.buy(deployment.usdc, market, 1, 50_000_000);
        deployment.oracle.proposeResult(marketAddress, payload(marketId, 0, "demo://full-flow/finalize"));
        deployment.oracle.finalize(marketId);
        result.yesRedeemed = finalizingActor.redeem(market, 0, 100_000_000);
        result.noRedeemed = finalizingActor.redeem(market, 1, 50_000_000);

        (address voidMarketAddress, bytes32 voidMarketId, bytes32 voidConditionId) = deployment.factory.createMarket(
            "fixture:demo-2026-001:goal_window:4380:4980:full-flow-void",
            "demo-2026-001",
            4380,
            4980,
            block.timestamp + 300,
            keccak256("goal-in-window"),
            2
        );
        WorldCupMarket voidMarket = WorldCupMarket(voidMarketAddress);
        FlowActor refundActor = new FlowActor();
        deployment.usdc.mint(address(refundActor), 100_000_000);
        refundActor.buy(deployment.usdc, voidMarket, 0, 100_000_000);
        deployment.oracle.voidMarket(voidMarketAddress, voidMarketId);
        result.refunded = refundActor.refund(voidMarket, 0, 100_000_000);

        result.market = marketAddress;
        result.marketId = marketId;
        result.conditionId = conditionId;
        voidConditionId;
        result.finalStatus = market.status();
        result.voidStatus = voidMarket.status();
    }

    function payload(bytes32 marketId, uint8 winningOutcome, string memory evidenceUri) public pure returns (OptimisticResultOracle.ResultPayload memory) {
        return OptimisticResultOracle.ResultPayload({
            marketId: marketId,
            winningOutcome: winningOutcome,
            homeScore: 1,
            awayScore: 0,
            dataSourceHash: keccak256("demo-events"),
            evidenceUri: evidenceUri
        });
    }
}
