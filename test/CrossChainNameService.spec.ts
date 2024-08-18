import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { CrossChainNameServiceLookup, CrossChainNameServiceRegister, CrossChainNameServiceReceiver, CCIPLocalSimulator } from "../typechain-types";
import { BigNumber } from "ethers";

describe("CrossChainNameService", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployFixture() {
        const ccipLocalSimualtorFactory = await ethers.getContractFactory(
            "CCIPLocalSimulator"
        );

        const ccipLocalSimulator: CCIPLocalSimulator =
            await ccipLocalSimualtorFactory.deploy();

        const [alice] = await ethers.getSigners();

        const config: {
            chainSelector_: BigNumber;
            sourceRouter_: string;
            destinationRouter_: string;
            wrappedNative_: string;
            linkToken_: string;
            ccipBnM_: string;
            ccipLnM_: string;
        } = await ccipLocalSimulator.configuration();

        const lookupFactory = await ethers.getContractFactory(
            "CrossChainNameServiceLookup"
        );
        const lookupSource: CrossChainNameServiceLookup = await lookupFactory.deploy();
        const lookupDestination: CrossChainNameServiceLookup = await lookupFactory.deploy();

        const registerFactory = await ethers.getContractFactory(
            "CrossChainNameServiceRegister"
        );
        const register: CrossChainNameServiceRegister =
            await registerFactory.deploy(config.destinationRouter_, lookupSource.address);

        const receiverFactory = await ethers.getContractFactory(
            "CrossChainNameServiceReceiver"
        );
        const receiver: CrossChainNameServiceReceiver = await receiverFactory.deploy(config.destinationRouter_, lookupDestination.address, config.chainSelector_);

        return { ccipLocalSimulator, alice, config, lookupSource, lookupDestination, register, receiver };
    }

    it("Should correctly register and lookup 'alice.ccns' across chains using CCIPLocalSimulator", async function () {
        const { ccipLocalSimulator, alice, config, lookupSource, lookupDestination, register, receiver } = await loadFixture(
            deployFixture
        );

        // 1. Set CrossChainNameServiceAddress on the source lookup contract to the Register contract's address
        await lookupSource.setCrossChainNameServiceAddress(register.address);

        // 2. Set CrossChainNameServiceAddress on the destination lookup contract to the Receiver contract's address
        await lookupDestination.setCrossChainNameServiceAddress(receiver.address);

        // 3. Enable the chain in the Register contract for cross-chain registration
        const chainSelector = await config.chainSelector_;
        const gasLimit = 200000; // Example gas limit for cross-chain message
        await register.enableChain(chainSelector, receiver.address, gasLimit);

        // 4. Register 'alice.ccns' with Alice's EOA address using the Register contract
        const name = "alice.ccns";
        await register.connect(alice).register(name);

        // 5. Check if the lookup contract for the source chain has the correct address
        let result = await lookupSource.lookup(name);
        expect(result).to.equal(alice.address);

        // 6. Check if the lookup contract for the destination chain has the correct address
        result = await lookupDestination.lookup(name);
        expect(result).to.equal(alice.address);
    });
});
