// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Deploy} from "../script/Deploy.s.sol";
import {SeedDemo} from "../script/SeedDemo.s.sol";
import {FullFlow} from "../script/FullFlow.s.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ConditionalTokensLite} from "../src/ConditionalTokensLite.sol";
import {OptimisticResultOracle} from "../src/OptimisticResultOracle.sol";
import {WorldCupMarketFactory} from "../src/WorldCupMarketFactory.sol";
import {WorldCupMarket} from "../src/WorldCupMarket.sol";

contract WorldCupScriptSmokeTest {
    function testDeployScriptWiresOwnershipAndOracle() public {
        Deploy deploy = new Deploy();
        (,, address oracleAddress, address factoryAddress) = deployAddresses(deploy);
        require(oracleAddress != address(0), "oracle missing");
        require(factoryAddress != address(0), "factory missing");
    }

    function testSeedDemoMintsMockUsdc() public {
        Deploy deploy = new Deploy();
        (address usdcAddress,,,) = deployAddresses(deploy);
        SeedDemo seed = new SeedDemo();
        seed.mint(MockUSDC(usdcAddress), address(0xA11CE), 123_000_000);
        require(MockUSDC(usdcAddress).balanceOf(address(0xA11CE)) == 123_000_000, "seed mint failed");
    }

    function testFullFlowScriptRunsFinalizeAndVoidPaths() public {
        FullFlow flow = new FullFlow();
        (, FullFlow.FlowResult memory result) = flow.run();
        require(result.market != address(0), "market missing");
        require(result.yesRedeemed == 100_000_000, "yes redeem failed");
        require(result.noRedeemed == 0, "no redeem should be zero");
        require(result.refunded == 100_000_000, "refund failed");
        require(result.finalStatus == WorldCupMarket.Status.Redeemable, "final status wrong");
        require(result.voidStatus == WorldCupMarket.Status.Voided, "void status wrong");
    }

    function deployAddresses(Deploy deploy) internal returns (address usdc, address ctf, address oracle, address factory) {
        (MockUSDC usdcContract, ConditionalTokensLite ctfContract, OptimisticResultOracle oracleContract, WorldCupMarketFactory factoryContract) = deploy.run();
        return (address(usdcContract), address(ctfContract), address(oracleContract), address(factoryContract));
    }
}
