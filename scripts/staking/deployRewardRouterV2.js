const {
  deployContract,
  contractAt,
  sendTxn,
  writeTmpAddresses,
} = require("../shared/helpers");

const network = process.env.HARDHAT_NETWORK || "mainnet";
const tokens = require("../core/tokens")[network];

async function main() {
  const { nativeToken } = tokens;

  const vestingDuration = 365 * 24 * 60 * 60;

  const xpcManager = await contractAt(
    "XpcManager",
    "0x9f03a788eFC7f88918Db0Ce2B9B2D84Eb1455d66"
  );
  const xpc = await contractAt(
    "XPC",
    "0x036EF092eF4152459A33e67252B185CAD6108D4a"
  );

  const opec = await contractAt(
    "OPEC",
    "0xeBC2C29BCd212A5251E0980B6Fc9e81717A8Fb3E"
  );
  const esOpec = await contractAt(
    "EsOpec",
    "0xFfa05E4B6017466ac3ad10bC488725eF3BC7591B"
  );
  const bnOpec = await deployContract("MintableBaseToken", [
    "BonusOPEC",
    "bnOpec",
    0,
  ]);

  await sendTxn(
    esOpec.setInPrivateTransferMode(true),
    "esOpec.setInPrivateTransferMode"
  );
  await sendTxn(
    xpc.setInPrivateTransferMode(true),
    "xpc.setInPrivateTransferMode"
  );

  const stakedOpecTracker = await deployContract("RewardTracker", [
    "StakedOPEC",
    "sOpec",
  ]);
  const stakedOpecDistributor = await deployContract("RewardDistributor", [
    esOpec.address,
    stakedOpecTracker.address,
  ]);
  await sendTxn(
    stakedOpecTracker.initialize(
      [opec.address, esOpec.address],
      stakedOpecDistributor.address
    ),
    "stakedOpecTracker.initialize"
  );
  await sendTxn(
    stakedOpecDistributor.updateLastDistributionTime(),
    "stakedOpecDistributor.updateLastDistributionTime"
  );

  const bonusOpecTracker = await deployContract("RewardTracker", [
    "StakedBonusOPEC",
    "sbOpec",
  ]);
  const bonusOpecDistributor = await deployContract("BonusDistributor", [
    bnOpec.address,
    bonusOpecTracker.address,
  ]);
  await sendTxn(
    bonusOpecTracker.initialize(
      [stakedOpecTracker.address],
      bonusOpecDistributor.address
    ),
    "bonusOpecTracker.initialize"
  );
  await sendTxn(
    bonusOpecDistributor.updateLastDistributionTime(),
    "bonusOpecDistributor.updateLastDistributionTime"
  );

  const feeOpecTracker = await deployContract("RewardTracker", [
    "StakedBonusFeeOPEC",
    "sbfOpec",
  ]);
  const feeOpecDistributor = await deployContract("RewardDistributor", [
    nativeToken.address,
    feeOpecTracker.address,
  ]);
  await sendTxn(
    feeOpecTracker.initialize(
      [bonusOpecTracker.address, bnOpec.address],
      feeOpecDistributor.address
    ),
    "feeOpecTracker.initialize"
  );
  await sendTxn(
    feeOpecDistributor.updateLastDistributionTime(),
    "feeOpecDistributor.updateLastDistributionTime"
  );

  const feeXpcTracker = await deployContract("RewardTracker", [
    "FeeXPC",
    "fXPC",
  ]);
  const feeXpcDistributor = await deployContract("RewardDistributor", [
    nativeToken.address,
    feeXpcTracker.address,
  ]);
  await sendTxn(
    feeXpcTracker.initialize([xpc.address], feeXpcDistributor.address),
    "feeXpcTracker.initialize"
  );
  await sendTxn(
    feeXpcDistributor.updateLastDistributionTime(),
    "feeXpcDistributor.updateLastDistributionTime"
  );

  const stakedXpcTracker = await deployContract("RewardTracker", [
    "FeeStakedXPC",
    "fsXPC",
  ]);
  const stakedXpcDistributor = await deployContract("RewardDistributor", [
    esOpec.address,
    stakedXpcTracker.address,
  ]);
  await sendTxn(
    stakedXpcTracker.initialize(
      [feeXpcTracker.address],
      stakedXpcDistributor.address
    ),
    "stakedXpcTracker.initialize"
  );
  await sendTxn(
    stakedXpcDistributor.updateLastDistributionTime(),
    "stakedXpcDistributor.updateLastDistributionTime"
  );

  await sendTxn(
    stakedOpecTracker.setInPrivateTransferMode(true),
    "stakedOpecTracker.setInPrivateTransferMode"
  );
  await sendTxn(
    stakedOpecTracker.setInPrivateStakingMode(true),
    "stakedOpecTracker.setInPrivateStakingMode"
  );
  await sendTxn(
    bonusOpecTracker.setInPrivateTransferMode(true),
    "bonusOpecTracker.setInPrivateTransferMode"
  );
  await sendTxn(
    bonusOpecTracker.setInPrivateStakingMode(true),
    "bonusOpecTracker.setInPrivateStakingMode"
  );
  await sendTxn(
    bonusOpecTracker.setInPrivateClaimingMode(true),
    "bonusOpecTracker.setInPrivateClaimingMode"
  );
  await sendTxn(
    feeOpecTracker.setInPrivateTransferMode(true),
    "feeOpecTracker.setInPrivateTransferMode"
  );
  await sendTxn(
    feeOpecTracker.setInPrivateStakingMode(true),
    "feeOpecTracker.setInPrivateStakingMode"
  );

  await sendTxn(
    feeXpcTracker.setInPrivateTransferMode(true),
    "feeXpcTracker.setInPrivateTransferMode"
  );
  await sendTxn(
    feeXpcTracker.setInPrivateStakingMode(true),
    "feeXpcTracker.setInPrivateStakingMode"
  );
  await sendTxn(
    stakedXpcTracker.setInPrivateTransferMode(true),
    "stakedXpcTracker.setInPrivateTransferMode"
  );
  await sendTxn(
    stakedXpcTracker.setInPrivateStakingMode(true),
    "stakedXpcTracker.setInPrivateStakingMode"
  );

  const opecVester = await deployContract("Vester", [
    "VestedOPEC", // _name
    "vOpec", // _symbol
    vestingDuration, // _vestingDuration
    esOpec.address, // _esToken
    feeOpecTracker.address, // _pairToken
    opec.address, // _claimableToken
    stakedOpecTracker.address, // _rewardTracker
  ]);

  const xpcVester = await deployContract("Vester", [
    "VestedXPC", // _name
    "vXPC", // _symbol
    vestingDuration, // _vestingDuration
    esOpec.address, // _esToken
    stakedXpcTracker.address, // _pairToken
    opec.address, // _claimableToken
    stakedXpcTracker.address, // _rewardTracker
  ]);

  const rewardRouter = await deployContract("RewardRouterV2", []);
  await sendTxn(
    rewardRouter.initialize(
      nativeToken.address,
      opec.address,
      esOpec.address,
      bnOpec.address,
      xpc.address,
      stakedOpecTracker.address,
      bonusOpecTracker.address,
      feeOpecTracker.address,
      feeXpcTracker.address,
      stakedXpcTracker.address,
      xpcManager.address,
      opecVester.address,
      xpcVester.address
    ),
    "rewardRouter.initialize"
  );

  await sendTxn(
    xpcManager.setHandler(rewardRouter.address, true),
    "xpcManager.setHandler(rewardRouter)"
  );

  // allow rewardRouter to stake in stakedOpecTracker
  await sendTxn(
    stakedOpecTracker.setHandler(rewardRouter.address, true),
    "stakedOpecTracker.setHandler(rewardRouter)"
  );
  // allow bonusOpecTracker to stake stakedOpecTracker
  await sendTxn(
    stakedOpecTracker.setHandler(bonusOpecTracker.address, true),
    "stakedOpecTracker.setHandler(bonusOpecTracker)"
  );
  // allow rewardRouter to stake in bonusOpecTracker
  await sendTxn(
    bonusOpecTracker.setHandler(rewardRouter.address, true),
    "bonusOpecTracker.setHandler(rewardRouter)"
  );
  // allow bonusOpecTracker to stake feeOpecTracker
  await sendTxn(
    bonusOpecTracker.setHandler(feeOpecTracker.address, true),
    "bonusOpecTracker.setHandler(feeOpecTracker)"
  );
  await sendTxn(
    bonusOpecDistributor.setBonusMultiplier(10000),
    "bonusOpecDistributor.setBonusMultiplier"
  );
  // allow rewardRouter to stake in feeOpecTracker
  await sendTxn(
    feeOpecTracker.setHandler(rewardRouter.address, true),
    "feeOpecTracker.setHandler(rewardRouter)"
  );
  // allow stakedOpecTracker to stake esOpec
  await sendTxn(
    esOpec.setHandler(stakedOpecTracker.address, true),
    "esOpec.setHandler(stakedOpecTracker)"
  );
  // allow feeOpecTracker to stake bnOpec
  await sendTxn(
    bnOpec.setHandler(feeOpecTracker.address, true),
    "bnOpec.setHandler(feeOpecTracker"
  );
  // allow rewardRouter to burn bnOpec
  await sendTxn(
    bnOpec.setMinter(rewardRouter.address, true),
    "bnOpec.setMinter(rewardRouter"
  );

  // allow stakedXpcTracker to stake feeXpcTracker
  await sendTxn(
    feeXpcTracker.setHandler(stakedXpcTracker.address, true),
    "feeXpcTracker.setHandler(stakedXpcTracker)"
  );
  // allow feeXpcTracker to stake xpc
  await sendTxn(
    xpc.setHandler(feeXpcTracker.address, true),
    "xpc.setHandler(feeXpcTracker)"
  );

  // allow rewardRouter to stake in feeXpcTracker
  await sendTxn(
    feeXpcTracker.setHandler(rewardRouter.address, true),
    "feeXpcTracker.setHandler(rewardRouter)"
  );
  // allow rewardRouter to stake in stakedXpcTracker
  await sendTxn(
    stakedXpcTracker.setHandler(rewardRouter.address, true),
    "stakedXpcTracker.setHandler(rewardRouter)"
  );

  await sendTxn(
    esOpec.setHandler(rewardRouter.address, true),
    "esOpec.setHandler(rewardRouter)"
  );
  await sendTxn(
    esOpec.setHandler(stakedOpecDistributor.address, true),
    "esOpec.setHandler(stakedOpecDistributor)"
  );
  await sendTxn(
    esOpec.setHandler(stakedXpcDistributor.address, true),
    "esOpec.setHandler(stakedXpcDistributor)"
  );
  await sendTxn(
    esOpec.setHandler(stakedXpcTracker.address, true),
    "esOpec.setHandler(stakedXpcTracker)"
  );
  await sendTxn(
    esOpec.setHandler(opecVester.address, true),
    "esOpec.setHandler(opecVester)"
  );
  await sendTxn(
    esOpec.setHandler(xpcVester.address, true),
    "esOpec.setHandler(xpcVester)"
  );

  await sendTxn(
    esOpec.setMinter(opecVester.address, true),
    "esOpec.setMinter(opecVester)"
  );
  await sendTxn(
    esOpec.setMinter(xpcVester.address, true),
    "esOpec.setMinter(xpcVester)"
  );

  await sendTxn(
    opecVester.setHandler(rewardRouter.address, true),
    "opecVester.setHandler(rewardRouter)"
  );
  await sendTxn(
    xpcVester.setHandler(rewardRouter.address, true),
    "xpcVester.setHandler(rewardRouter)"
  );

  await sendTxn(
    feeOpecTracker.setHandler(opecVester.address, true),
    "feeOpecTracker.setHandler(opecVester)"
  );
  await sendTxn(
    stakedXpcTracker.setHandler(xpcVester.address, true),
    "stakedXpcTracker.setHandler(xpcVester)"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
