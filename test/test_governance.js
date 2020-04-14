const assert = require('assert');
const BigNumber = require('bignumber.js');
const { increaseEvmBlock, toBytes32 } = require('./funcs');
const { toWad, fromWad, infinity } = require('./constants');

const TestPerpGovernance = artifacts.require('test/TestPerpGovernance.sol');
const AMMGovernance = artifacts.require('liquidity/AMMGovernance.sol');
const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');

contract('TestPerpGovernance', accounts => {
    const NORMAL = 0;
    const SETTLING = 1;
    const SETTLED = 2;

    let governance;
    let ammGovernance;
    let globalConfig;

    const broker = accounts[9];
    const admin = accounts[0];

    const u1 = accounts[4];
    const u2 = accounts[5];
    const u3 = accounts[6];

    const users = {
        broker,
        admin,
        u1,
        u2,
        u3,
    };

    const deploy = async () => {
        governance = await TestPerpGovernance.new();
        ammGovernance = await AMMGovernance.new();
        globalConfig = await GlobalConfig.new();

        await useDefaultGlobalConfig();
        await useDefaulGovParamters();
        await usePoolDefaultParamters();
    };

    const useDefaultGlobalConfig = async () => {
        await globalConfig.setGlobalParameter(toBytes32("withdrawalLockBlockCount"), 5);
        await globalConfig.setGlobalParameter(toBytes32("brokerLockBlockCount"), 5);
    };

    const useDefaulGovParamters = async () => {
        await governance.setGovernanceParameter(toBytes32("initialMarginRate"), toWad(0.1));
        await governance.setGovernanceParameter(toBytes32("maintenanceMarginRate"), toWad(0.05));
        await governance.setGovernanceParameter(toBytes32("liquidationPenaltyRate"), toWad(0.005));
        await governance.setGovernanceParameter(toBytes32("penaltyFundRate"), toWad(0.005));
        await governance.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.00075));
        await governance.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(-0.00025));
        await governance.setGovernanceParameter(toBytes32("lotSize"), 1);
        await governance.setGovernanceParameter(toBytes32("tradingLotSize"), 1);
    };

    const usePoolDefaultParamters = async () => {
        await ammGovernance.setGovernanceParameter(toBytes32("poolFeeRate"), toWad(0.000375));
        await ammGovernance.setGovernanceParameter(toBytes32("poolDevFeeRate"), toWad(0.000375));
        await ammGovernance.setGovernanceParameter(toBytes32("updatePremiumPrize"), toWad(0));
        await ammGovernance.setGovernanceParameter(toBytes32('emaAlpha'), '3327787021630616'); // 2 / (600 + 1)
        await ammGovernance.setGovernanceParameter(toBytes32('markPremiumLimit'), toWad(0.005));
        await ammGovernance.setGovernanceParameter(toBytes32('fundingDampener'), toWad(0.0005));
    };

    describe("global config", async () => {
        before(deploy);

        it('set governance value', async () => {
            assert.equal(await globalConfig.withdrawalLockBlockCount(), 5);
            await globalConfig.setGlobalParameter(toBytes32("withdrawalLockBlockCount"), 4);
            assert.equal(await globalConfig.withdrawalLockBlockCount(), 4);

            assert.equal(await globalConfig.brokerLockBlockCount(), 5);
            await globalConfig.setGlobalParameter(toBytes32("brokerLockBlockCount"), 2);
            assert.equal(await globalConfig.brokerLockBlockCount(), 2);
        });

        it('key not exists', async () => {
            try {
                await globalConfig.setGlobalParameter(toBytes32("llllrate"), toWad(0.5));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("key not exists"), error);
            }
        });
    });

    describe("set parameters", async () => {
        beforeEach(deploy);

        it('set dev address', async () => {
            assert.equal(await governance.devAddress(), "0x0000000000000000000000000000000000000000");
            await governance.setGovernanceAddress(toBytes32("dev"), u1);
            assert.equal(await governance.devAddress(), u1);
        });

        it('set global config', async () => {
            let addr = await governance.globalConfig();
            assert.equal(addr, "0x0000000000000000000000000000000000000000");

            let config = await GlobalConfig.new();
            await config.setGlobalParameter(toBytes32("withdrawalLockBlockCount"), 1);

            await governance.setGovernanceAddress(toBytes32("globalConfig"), config.address);
            addr = await governance.globalConfig();
            assert.equal(addr, config.address);

            config = await GlobalConfig.at(addr);
            assert.equal(await config.withdrawalLockBlockCount(), 1);
        });

        it('set funding', async () => {
            assert.equal(await governance.amm(), "0x0000000000000000000000000000000000000000");
            await governance.setGovernanceAddress(toBytes32("amm"), u2);
            assert.equal(await governance.amm(), u2);

            try {
                await governance.setGovernanceAddress(toBytes32("amm"), u3, { from: u1 });
            } catch (error) {
                assert.ok(error.message.includes("WhitelistAdmin role"), error);
            }
        });

        it('set governance value', async () => {
            assert.equal((await governance.getGovernance()).initialMarginRate, '100000000000000000');
            await governance.setGovernanceParameter(toBytes32("initialMarginRate"), toWad(0.5));
            assert.equal((await governance.getGovernance()).initialMarginRate, toWad(0.5));

            try {
                await governance.setGovernanceParameter(toBytes32("maintenanceMarginRate"), toWad(0.5));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("require mm < im"), error);
            }

            assert.equal((await governance.getGovernance()).maintenanceMarginRate, '50000000000000000');
            await governance.setGovernanceParameter(toBytes32("maintenanceMarginRate"), toWad(0.4));
            assert.equal((await governance.getGovernance()).maintenanceMarginRate, toWad(0.4));

            try {
                await governance.setGovernanceParameter(toBytes32("liquidationPenaltyRate"), toWad(0.5));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("require lpr < mm"), error);
            }

            assert.equal((await governance.getGovernance()).liquidationPenaltyRate, '5000000000000000');
            await governance.setGovernanceParameter(toBytes32("liquidationPenaltyRate"), toWad(0.3));
            assert.equal((await governance.getGovernance()).liquidationPenaltyRate, toWad(0.3));

            assert.equal((await governance.getGovernance()).penaltyFundRate, '5000000000000000');
            await governance.setGovernanceParameter(toBytes32("penaltyFundRate"), toWad(0.1));
            assert.equal((await governance.getGovernance()).penaltyFundRate, toWad(0.1));

            assert.equal((await governance.getGovernance()).takerDevFeeRate, '750000000000000');
            await governance.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.5));
            assert.equal((await governance.getGovernance()).takerDevFeeRate, toWad(0.5));

            assert.equal((await governance.getGovernance()).makerDevFeeRate, '-250000000000000');
            await governance.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0.5));
            assert.equal((await governance.getGovernance()).makerDevFeeRate, toWad(0.5));
        });

        it('key not exists', async () => {
            try {
                await governance.setGovernanceParameter(toBytes32("llllrate"), toWad(0.5));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("key not exists"), error);
            }
        });

        it('not owner', async () => {
            try {
                await governance.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.5), { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("WhitelistAdmin role"), error);
            }
        });
    });

    describe("status", async () => {
        beforeEach(deploy);

        it('set governance value', async () => {
            assert.equal((await ammGovernance.getGovernance()).poolFeeRate, '375000000000000');
            await ammGovernance.setGovernanceParameter(toBytes32("poolFeeRate"), toWad(0.5));
            assert.equal((await ammGovernance.getGovernance()).poolFeeRate, toWad(0.5));

            assert.equal((await ammGovernance.getGovernance()).poolDevFeeRate, '375000000000000');
            await ammGovernance.setGovernanceParameter(toBytes32("poolDevFeeRate"), toWad(0.4));
            assert.equal((await ammGovernance.getGovernance()).poolDevFeeRate, toWad(0.4));

            try {
                await ammGovernance.setGovernanceParameter(toBytes32("emaAlpha"), toWad(-0.5));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("alpha should be > 0"), error);
            }

            assert.equal((await ammGovernance.getGovernance()).emaAlpha, '3327787021630616');
            await ammGovernance.setGovernanceParameter(toBytes32("emaAlpha"), toWad(0.5));
            assert.equal((await ammGovernance.getGovernance()).emaAlpha, toWad(0.5));

            assert.equal((await ammGovernance.getGovernance()).updatePremiumPrize, '0');
            await ammGovernance.setGovernanceParameter(toBytes32("updatePremiumPrize"), toWad(0.3));
            assert.equal((await ammGovernance.getGovernance()).updatePremiumPrize, toWad(0.3));

            assert.equal((await ammGovernance.getGovernance()).markPremiumLimit, '5000000000000000');
            await ammGovernance.setGovernanceParameter(toBytes32("markPremiumLimit"), toWad(0.1));
            assert.equal((await ammGovernance.getGovernance()).markPremiumLimit, toWad(0.1));

            assert.equal((await ammGovernance.getGovernance()).fundingDampener, '500000000000000');
            await ammGovernance.setGovernanceParameter(toBytes32("fundingDampener"), toWad(0.2));
            assert.equal((await ammGovernance.getGovernance()).fundingDampener, toWad(0.2));
        });

        it('key not exists', async () => {
            try {
                await ammGovernance.setGovernanceParameter(toBytes32("llllrate"), toWad(0.5));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("key not exists"), error);
            }
        });
    });

    const isEmergency = async () => {
        const status = await governance.status();
        return status == SETTLING
    }

    const isGlobalSettled = async () => {
        const status = await governance.status();
        return status == SETTLED
    }


    describe("status", async () => {
        beforeEach(deploy);

        it("beginGlobalSettlement", async () => {
            assert.equal(await governance.status(), NORMAL);
            await governance.beginGlobalSettlement(toWad(7000));
            assert.equal(await governance.status(), SETTLING);
            assert.equal(await isEmergency(), true);
            assert.equal(await isGlobalSettled(), false);
            assert.equal(await governance.settlementPrice(), toWad(7000));
        });

        it("beginGlobalSettlement again", async () => {
            assert.equal(await governance.status(), NORMAL);
            await governance.beginGlobalSettlement(toWad(7000));
            assert.equal(await governance.status(), SETTLING);
            assert.equal(await isEmergency(), true);
            assert.equal(await isGlobalSettled(), false);
            assert.equal(await governance.settlementPrice(), toWad(7000));

            await governance.beginGlobalSettlement(toWad(7200));
            assert.equal(await governance.status(), SETTLING);
            assert.equal(await isEmergency(), true);
            assert.equal(await isGlobalSettled(), false);
            assert.equal(await governance.settlementPrice(), toWad(7200));
        });

        it("not owner", async () => {
            assert.equal(await governance.status(), NORMAL);
            try {
                await governance.beginGlobalSettlement(toWad(7000), { from: u1 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("WhitelistAdmin role"), error);
            }

            await governance.beginGlobalSettlement(toWad(7000));
            assert.equal(await governance.status(), SETTLING);
        });
    });
});