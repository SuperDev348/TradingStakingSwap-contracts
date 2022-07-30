const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print, newWallet } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("../core/Vault/helpers")

use(solidity)

describe("RewardRouterV2", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, user4, tokenManager] = provider.getWallets()

  const vestingDuration = 365 * 24 * 60 * 60

  let timelock
  let rewardManager

  let vault
  let xpcManager
  let xpc
  let usdg
  let router
  let vaultPriceFeed
  let bnb
  let bnbPriceFeed
  let btc
  let btcPriceFeed
  let eth
  let ethPriceFeed
  let dai
  let daiPriceFeed
  let busd
  let busdPriceFeed

  let opec
  let esOpec
  let bnOpec

  let stakedOpecTracker
  let stakedOpecDistributor
  let bonusOpecTracker
  let bonusOpecDistributor
  let feeOpecTracker
  let feeOpecDistributor

  let feeXpcTracker
  let feeXpcDistributor
  let stakedXpcTracker
  let stakedXpcDistributor

  let opecVester
  let xpcVester

  let rewardRouter

  beforeEach(async () => {
    rewardManager = await deployContract("RewardManager", [])
    timelock = await deployContract("Timelock", [
      wallet.address,
      10,
      rewardManager.address,
      tokenManager.address,
      tokenManager.address,
      expandDecimals(1000000, 18),
      10,
      100
    ])

    bnb = await deployContract("Token", [])
    bnbPriceFeed = await deployContract("PriceFeed", [])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PriceFeed", [])

    eth = await deployContract("Token", [])
    ethPriceFeed = await deployContract("PriceFeed", [])

    dai = await deployContract("Token", [])
    daiPriceFeed = await deployContract("PriceFeed", [])

    busd = await deployContract("Token", [])
    busdPriceFeed = await deployContract("PriceFeed", [])

    vault = await deployContract("Vault", [])
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])
    xpc = await deployContract("XPC", [])

    await initVault(vault, router, usdg, vaultPriceFeed)
    xpcManager = await deployContract("XpcManager", [vault.address, usdg.address, xpc.address, 24 * 60 * 60])

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await xpc.setInPrivateTransferMode(true)
    await xpc.setMinter(xpcManager.address, true)
    await xpcManager.setInPrivateMode(true)

    opec = await deployContract("OPEC", []);
    esOpec = await deployContract("EsOpec", []);
    bnOpec = await deployContract("MintableBaseToken", ["Bonus OPEC", "bnOpec", 0]);

    // OPEC
    stakedOpecTracker = await deployContract("RewardTracker", ["Staked OPEC", "sOpec"])
    stakedOpecDistributor = await deployContract("RewardDistributor", [esOpec.address, stakedOpecTracker.address])
    await stakedOpecTracker.initialize([opec.address, esOpec.address], stakedOpecDistributor.address)
    await stakedOpecDistributor.updateLastDistributionTime()

    bonusOpecTracker = await deployContract("RewardTracker", ["Staked + Bonus OPEC", "sbOpec"])
    bonusOpecDistributor = await deployContract("BonusDistributor", [bnOpec.address, bonusOpecTracker.address])
    await bonusOpecTracker.initialize([stakedOpecTracker.address], bonusOpecDistributor.address)
    await bonusOpecDistributor.updateLastDistributionTime()

    feeOpecTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee OPEC", "sbfOpec"])
    feeOpecDistributor = await deployContract("RewardDistributor", [eth.address, feeOpecTracker.address])
    await feeOpecTracker.initialize([bonusOpecTracker.address, bnOpec.address], feeOpecDistributor.address)
    await feeOpecDistributor.updateLastDistributionTime()

    // XPC
    feeXpcTracker = await deployContract("RewardTracker", ["Fee XPC", "fXPC"])
    feeXpcDistributor = await deployContract("RewardDistributor", [eth.address, feeXpcTracker.address])
    await feeXpcTracker.initialize([xpc.address], feeXpcDistributor.address)
    await feeXpcDistributor.updateLastDistributionTime()

    stakedXpcTracker = await deployContract("RewardTracker", ["Fee + Staked XPC", "fsXPC"])
    stakedXpcDistributor = await deployContract("RewardDistributor", [esOpec.address, stakedXpcTracker.address])
    await stakedXpcTracker.initialize([feeXpcTracker.address], stakedXpcDistributor.address)
    await stakedXpcDistributor.updateLastDistributionTime()

    opecVester = await deployContract("Vester", [
      "Vested OPEC", // _name
      "vOpec", // _symbol
      vestingDuration, // _vestingDuration
      esOpec.address, // _esToken
      feeOpecTracker.address, // _pairToken
      opec.address, // _claimableToken
      stakedOpecTracker.address, // _rewardTracker
    ])

    xpcVester = await deployContract("Vester", [
      "Vested XPC", // _name
      "vXPC", // _symbol
      vestingDuration, // _vestingDuration
      esOpec.address, // _esToken
      stakedXpcTracker.address, // _pairToken
      opec.address, // _claimableToken
      stakedXpcTracker.address, // _rewardTracker
    ])

    await stakedOpecTracker.setInPrivateTransferMode(true)
    await stakedOpecTracker.setInPrivateStakingMode(true)
    await bonusOpecTracker.setInPrivateTransferMode(true)
    await bonusOpecTracker.setInPrivateStakingMode(true)
    await bonusOpecTracker.setInPrivateClaimingMode(true)
    await feeOpecTracker.setInPrivateTransferMode(true)
    await feeOpecTracker.setInPrivateStakingMode(true)

    await feeXpcTracker.setInPrivateTransferMode(true)
    await feeXpcTracker.setInPrivateStakingMode(true)
    await stakedXpcTracker.setInPrivateTransferMode(true)
    await stakedXpcTracker.setInPrivateStakingMode(true)

    await esOpec.setInPrivateTransferMode(true)

    rewardRouter = await deployContract("RewardRouterV2", [])
    await rewardRouter.initialize(
      bnb.address,
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
    )

    await rewardManager.initialize(
      timelock.address,
      rewardRouter.address,
      xpcManager.address,
      stakedOpecTracker.address,
      bonusOpecTracker.address,
      feeOpecTracker.address,
      feeXpcTracker.address,
      stakedXpcTracker.address,
      stakedOpecDistributor.address,
      stakedXpcDistributor.address,
      esOpec.address,
      bnOpec.address,
      opecVester.address,
      xpcVester.address
    )

    // allow bonusOpecTracker to stake stakedOpecTracker
    await stakedOpecTracker.setHandler(bonusOpecTracker.address, true)
    // allow bonusOpecTracker to stake feeOpecTracker
    await bonusOpecTracker.setHandler(feeOpecTracker.address, true)
    await bonusOpecDistributor.setBonusMultiplier(10000)
    // allow feeOpecTracker to stake bnOpec
    await bnOpec.setHandler(feeOpecTracker.address, true)

    // allow stakedXpcTracker to stake feeXpcTracker
    await feeXpcTracker.setHandler(stakedXpcTracker.address, true)
    // allow feeXpcTracker to stake xpc
    await xpc.setHandler(feeXpcTracker.address, true)

    // mint esOpec for distributors
    await esOpec.setMinter(wallet.address, true)
    await esOpec.mint(stakedOpecDistributor.address, expandDecimals(50000, 18))
    await stakedOpecDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esOpec per second
    await esOpec.mint(stakedXpcDistributor.address, expandDecimals(50000, 18))
    await stakedXpcDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esOpec per second

    // mint bnOpec for distributor
    await bnOpec.setMinter(wallet.address, true)
    await bnOpec.mint(bonusOpecDistributor.address, expandDecimals(1500, 18))

    await esOpec.setHandler(tokenManager.address, true)
    await opecVester.setHandler(wallet.address, true)

    await xpcManager.setGov(timelock.address)
    await stakedOpecTracker.setGov(timelock.address)
    await bonusOpecTracker.setGov(timelock.address)
    await feeOpecTracker.setGov(timelock.address)
    await feeXpcTracker.setGov(timelock.address)
    await stakedXpcTracker.setGov(timelock.address)
    await stakedOpecDistributor.setGov(timelock.address)
    await stakedXpcDistributor.setGov(timelock.address)
    await esOpec.setGov(timelock.address)
    await bnOpec.setGov(timelock.address)
    await opecVester.setGov(timelock.address)
    await xpcVester.setGov(timelock.address)

    await rewardManager.updateEsOpecHandlers()
    await rewardManager.enableRewardRouter()
  })

  it("inits", async () => {
    expect(await rewardRouter.isInitialized()).eq(true)

    expect(await rewardRouter.weth()).eq(bnb.address)
    expect(await rewardRouter.opec()).eq(opec.address)
    expect(await rewardRouter.esOpec()).eq(esOpec.address)
    expect(await rewardRouter.bnOpec()).eq(bnOpec.address)

    expect(await rewardRouter.xpc()).eq(xpc.address)

    expect(await rewardRouter.stakedOpecTracker()).eq(stakedOpecTracker.address)
    expect(await rewardRouter.bonusOpecTracker()).eq(bonusOpecTracker.address)
    expect(await rewardRouter.feeOpecTracker()).eq(feeOpecTracker.address)

    expect(await rewardRouter.feeXpcTracker()).eq(feeXpcTracker.address)
    expect(await rewardRouter.stakedXpcTracker()).eq(stakedXpcTracker.address)

    expect(await rewardRouter.xpcManager()).eq(xpcManager.address)

    expect(await rewardRouter.opecVester()).eq(opecVester.address)
    expect(await rewardRouter.xpcVester()).eq(xpcVester.address)

    await expect(rewardRouter.initialize(
      bnb.address,
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
    )).to.be.revertedWith("RewardRouter: already initialized")

    expect(await rewardManager.timelock()).eq(timelock.address)
    expect(await rewardManager.rewardRouter()).eq(rewardRouter.address)
    expect(await rewardManager.xpcManager()).eq(xpcManager.address)
    expect(await rewardManager.stakedOpecTracker()).eq(stakedOpecTracker.address)
    expect(await rewardManager.bonusOpecTracker()).eq(bonusOpecTracker.address)
    expect(await rewardManager.feeOpecTracker()).eq(feeOpecTracker.address)
    expect(await rewardManager.feeXpcTracker()).eq(feeXpcTracker.address)
    expect(await rewardManager.stakedXpcTracker()).eq(stakedXpcTracker.address)
    expect(await rewardManager.stakedOpecTracker()).eq(stakedOpecTracker.address)
    expect(await rewardManager.stakedOpecDistributor()).eq(stakedOpecDistributor.address)
    expect(await rewardManager.stakedXpcDistributor()).eq(stakedXpcDistributor.address)
    expect(await rewardManager.esOpec()).eq(esOpec.address)
    expect(await rewardManager.bnOpec()).eq(bnOpec.address)
    expect(await rewardManager.opecVester()).eq(opecVester.address)
    expect(await rewardManager.xpcVester()).eq(xpcVester.address)

    await expect(rewardManager.initialize(
      timelock.address,
      rewardRouter.address,
      xpcManager.address,
      stakedOpecTracker.address,
      bonusOpecTracker.address,
      feeOpecTracker.address,
      feeXpcTracker.address,
      stakedXpcTracker.address,
      stakedOpecDistributor.address,
      stakedXpcDistributor.address,
      esOpec.address,
      bnOpec.address,
      opecVester.address,
      xpcVester.address
    )).to.be.revertedWith("RewardManager: already initialized")
  })

  it("stakeOpecForAccount, stakeOpec, stakeEsOpec, unstakeOpec, unstakeEsOpec, claimEsOpec, claimFees, compound, batchCompoundForAccounts", async () => {
    await eth.mint(feeOpecDistributor.address, expandDecimals(100, 18))
    await feeOpecDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await opec.setMinter(wallet.address, true)
    await opec.mint(user0.address, expandDecimals(1500, 18))
    expect(await opec.balanceOf(user0.address)).eq(expandDecimals(1500, 18))

    await opec.connect(user0).approve(stakedOpecTracker.address, expandDecimals(1000, 18))
    await expect(rewardRouter.connect(user0).stakeOpecForAccount(user1.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("Governable: forbidden")

    await rewardRouter.setGov(user0.address)
    await rewardRouter.connect(user0).stakeOpecForAccount(user1.address, expandDecimals(800, 18))
    expect(await opec.balanceOf(user0.address)).eq(expandDecimals(700, 18))

    await opec.mint(user1.address, expandDecimals(200, 18))
    expect(await opec.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await opec.connect(user1).approve(stakedOpecTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeOpec(expandDecimals(200, 18))
    expect(await opec.balanceOf(user1.address)).eq(0)

    expect(await stakedOpecTracker.stakedAmounts(user0.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user0.address, opec.address)).eq(0)
    expect(await stakedOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(1000, 18))

    expect(await bonusOpecTracker.stakedAmounts(user0.address)).eq(0)
    expect(await bonusOpecTracker.depositBalances(user0.address, stakedOpecTracker.address)).eq(0)
    expect(await bonusOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await bonusOpecTracker.depositBalances(user1.address, stakedOpecTracker.address)).eq(expandDecimals(1000, 18))

    expect(await feeOpecTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeOpecTracker.depositBalances(user0.address, bonusOpecTracker.address)).eq(0)
    expect(await feeOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).eq(expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedOpecTracker.claimable(user0.address)).eq(0)
    expect(await stakedOpecTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedOpecTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    expect(await bonusOpecTracker.claimable(user0.address)).eq(0)
    expect(await bonusOpecTracker.claimable(user1.address)).gt("2730000000000000000") // 2.73, 1000 / 365 => ~2.74
    expect(await bonusOpecTracker.claimable(user1.address)).lt("2750000000000000000") // 2.75

    expect(await feeOpecTracker.claimable(user0.address)).eq(0)
    expect(await feeOpecTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeOpecTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    await timelock.mint(esOpec.address, expandDecimals(500, 18))
    await esOpec.connect(tokenManager).transferFrom(tokenManager.address, user2.address, expandDecimals(500, 18))
    await rewardRouter.connect(user2).stakeEsOpec(expandDecimals(500, 18))

    expect(await stakedOpecTracker.stakedAmounts(user0.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user0.address, opec.address)).eq(0)
    expect(await stakedOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(1000, 18))
    expect(await stakedOpecTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await stakedOpecTracker.depositBalances(user2.address, esOpec.address)).eq(expandDecimals(500, 18))

    expect(await bonusOpecTracker.stakedAmounts(user0.address)).eq(0)
    expect(await bonusOpecTracker.depositBalances(user0.address, stakedOpecTracker.address)).eq(0)
    expect(await bonusOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await bonusOpecTracker.depositBalances(user1.address, stakedOpecTracker.address)).eq(expandDecimals(1000, 18))
    expect(await bonusOpecTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await bonusOpecTracker.depositBalances(user2.address, stakedOpecTracker.address)).eq(expandDecimals(500, 18))

    expect(await feeOpecTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeOpecTracker.depositBalances(user0.address, bonusOpecTracker.address)).eq(0)
    expect(await feeOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).eq(expandDecimals(1000, 18))
    expect(await feeOpecTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await feeOpecTracker.depositBalances(user2.address, bonusOpecTracker.address)).eq(expandDecimals(500, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedOpecTracker.claimable(user0.address)).eq(0)
    expect(await stakedOpecTracker.claimable(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedOpecTracker.claimable(user1.address)).lt(expandDecimals(1786 + 1191, 18))
    expect(await stakedOpecTracker.claimable(user2.address)).gt(expandDecimals(595, 18))
    expect(await stakedOpecTracker.claimable(user2.address)).lt(expandDecimals(596, 18))

    expect(await bonusOpecTracker.claimable(user0.address)).eq(0)
    expect(await bonusOpecTracker.claimable(user1.address)).gt("5470000000000000000") // 5.47, 1000 / 365 * 2 => ~5.48
    expect(await bonusOpecTracker.claimable(user1.address)).lt("5490000000000000000")
    expect(await bonusOpecTracker.claimable(user2.address)).gt("1360000000000000000") // 1.36, 500 / 365 => ~1.37
    expect(await bonusOpecTracker.claimable(user2.address)).lt("1380000000000000000")

    expect(await feeOpecTracker.claimable(user0.address)).eq(0)
    expect(await feeOpecTracker.claimable(user1.address)).gt("5940000000000000000") // 5.94, 3.57 + 100 / 28 / 3 * 2 => ~5.95
    expect(await feeOpecTracker.claimable(user1.address)).lt("5960000000000000000")
    expect(await feeOpecTracker.claimable(user2.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeOpecTracker.claimable(user2.address)).lt("1200000000000000000")

    expect(await esOpec.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimEsOpec()
    expect(await esOpec.balanceOf(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await esOpec.balanceOf(user1.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await eth.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimFees()
    expect(await eth.balanceOf(user1.address)).gt("5940000000000000000")
    expect(await eth.balanceOf(user1.address)).lt("5960000000000000000")

    expect(await esOpec.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimEsOpec()
    expect(await esOpec.balanceOf(user2.address)).gt(expandDecimals(595, 18))
    expect(await esOpec.balanceOf(user2.address)).lt(expandDecimals(596, 18))

    expect(await eth.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimFees()
    expect(await eth.balanceOf(user2.address)).gt("1180000000000000000")
    expect(await eth.balanceOf(user2.address)).lt("1200000000000000000")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx0 = await rewardRouter.connect(user1).compound()
    await reportGasUsed(provider, tx0, "compound gas used")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx1 = await rewardRouter.connect(user0).batchCompoundForAccounts([user1.address, user2.address])
    await reportGasUsed(provider, tx1, "batchCompoundForAccounts gas used")

    expect(await stakedOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(3643, 18))
    expect(await stakedOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(3645, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(1000, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).gt(expandDecimals(2643, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).lt(expandDecimals(2645, 18))

    expect(await bonusOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(3643, 18))
    expect(await bonusOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(3645, 18))

    expect(await feeOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(3657, 18))
    expect(await feeOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(3659, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).gt(expandDecimals(3643, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).lt(expandDecimals(3645, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("14100000000000000000") // 14.1
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("14300000000000000000") // 14.3

    expect(await opec.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).unstakeOpec(expandDecimals(300, 18))
    expect(await opec.balanceOf(user1.address)).eq(expandDecimals(300, 18))

    expect(await stakedOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(3343, 18))
    expect(await stakedOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(3345, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(700, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).gt(expandDecimals(2643, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).lt(expandDecimals(2645, 18))

    expect(await bonusOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(3343, 18))
    expect(await bonusOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(3345, 18))

    expect(await feeOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(3357, 18))
    expect(await feeOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(3359, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).gt(expandDecimals(3343, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).lt(expandDecimals(3345, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("13000000000000000000") // 13
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("13100000000000000000") // 13.1

    const esOpecBalance1 = await esOpec.balanceOf(user1.address)
    const esOpecUnstakeBalance1 = await stakedOpecTracker.depositBalances(user1.address, esOpec.address)
    await rewardRouter.connect(user1).unstakeEsOpec(esOpecUnstakeBalance1)
    expect(await esOpec.balanceOf(user1.address)).eq(esOpecBalance1.add(esOpecUnstakeBalance1))

    expect(await stakedOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(700, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(700, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).eq(0)

    expect(await bonusOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(700, 18))

    expect(await feeOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(702, 18))
    expect(await feeOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(703, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).eq(expandDecimals(700, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("2720000000000000000") // 2.72
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("2740000000000000000") // 2.74

    await expect(rewardRouter.connect(user1).unstakeEsOpec(expandDecimals(1, 18)))
      .to.be.revertedWith("RewardTracker: _amount exceeds depositBalance")
  })

  it("mintAndStakeXpc, unstakeAndRedeemXpc, compound, batchCompoundForAccounts", async () => {
    await eth.mint(feeXpcDistributor.address, expandDecimals(100, 18))
    await feeXpcDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(xpcManager.address, expandDecimals(1, 18))
    const tx0 = await rewardRouter.connect(user1).mintAndStakeXpc(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )
    await reportGasUsed(provider, tx0, "mintAndStakeXpc gas used")

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXpcTracker.depositBalances(user1.address, xpc.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXpcTracker.depositBalances(user1.address, feeXpcTracker.address)).eq(expandDecimals(2991, 17))

    await bnb.mint(user1.address, expandDecimals(2, 18))
    await bnb.connect(user1).approve(xpcManager.address, expandDecimals(2, 18))
    await rewardRouter.connect(user1).mintAndStakeXpc(
      bnb.address,
      expandDecimals(2, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await increaseTime(provider, 24 * 60 * 60 + 1)
    await mineBlock(provider)

    expect(await feeXpcTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeXpcTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    expect(await stakedXpcTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedXpcTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    await bnb.mint(user2.address, expandDecimals(1, 18))
    await bnb.connect(user2).approve(xpcManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user2).mintAndStakeXpc(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await expect(rewardRouter.connect(user2).unstakeAndRedeemXpc(
      bnb.address,
      expandDecimals(299, 18),
      "990000000000000000", // 0.99
      user2.address
    )).to.be.revertedWith("XpcManager: cooldown duration not yet passed")

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq("897300000000000000000") // 897.3
    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq("897300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq(0)

    const tx1 = await rewardRouter.connect(user1).unstakeAndRedeemXpc(
      bnb.address,
      expandDecimals(299, 18),
      "990000000000000000", // 0.99
      user1.address
    )
    await reportGasUsed(provider, tx1, "unstakeAndRedeemXpc gas used")

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq("993676666666666666") // ~0.99

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await feeXpcTracker.claimable(user1.address)).gt("5940000000000000000") // 5.94, 3.57 + 100 / 28 / 3 * 2 => ~5.95
    expect(await feeXpcTracker.claimable(user1.address)).lt("5960000000000000000")
    expect(await feeXpcTracker.claimable(user2.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeXpcTracker.claimable(user2.address)).lt("1200000000000000000")

    expect(await stakedXpcTracker.claimable(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedXpcTracker.claimable(user1.address)).lt(expandDecimals(1786 + 1191, 18))
    expect(await stakedXpcTracker.claimable(user2.address)).gt(expandDecimals(595, 18))
    expect(await stakedXpcTracker.claimable(user2.address)).lt(expandDecimals(596, 18))

    expect(await esOpec.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimEsOpec()
    expect(await esOpec.balanceOf(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await esOpec.balanceOf(user1.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await eth.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimFees()
    expect(await eth.balanceOf(user1.address)).gt("5940000000000000000")
    expect(await eth.balanceOf(user1.address)).lt("5960000000000000000")

    expect(await esOpec.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimEsOpec()
    expect(await esOpec.balanceOf(user2.address)).gt(expandDecimals(595, 18))
    expect(await esOpec.balanceOf(user2.address)).lt(expandDecimals(596, 18))

    expect(await eth.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimFees()
    expect(await eth.balanceOf(user2.address)).gt("1180000000000000000")
    expect(await eth.balanceOf(user2.address)).lt("1200000000000000000")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx2 = await rewardRouter.connect(user1).compound()
    await reportGasUsed(provider, tx2, "compound gas used")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx3 = await rewardRouter.batchCompoundForAccounts([user1.address, user2.address])
    await reportGasUsed(provider, tx1, "batchCompoundForAccounts gas used")

    expect(await stakedOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    expect(await stakedOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).gt(expandDecimals(4165, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).lt(expandDecimals(4167, 18))

    expect(await bonusOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    expect(await bonusOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))

    expect(await feeOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(4179, 18))
    expect(await feeOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(4180, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).gt(expandDecimals(4165, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).lt(expandDecimals(4167, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("12900000000000000000") // 12.9
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("13100000000000000000") // 13.1

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq("993676666666666666") // ~0.99
  })

  it("mintAndStakeXpcETH, unstakeAndRedeemXpcETH", async () => {
    const receiver0 = newWallet()
    await expect(rewardRouter.connect(user0).mintAndStakeXpcETH(expandDecimals(300, 18), expandDecimals(300, 18), { value: 0 }))
      .to.be.revertedWith("RewardRouter: invalid msg.value")

    await expect(rewardRouter.connect(user0).mintAndStakeXpcETH(expandDecimals(300, 18), expandDecimals(300, 18), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("XpcManager: insufficient USDG output")

    await expect(rewardRouter.connect(user0).mintAndStakeXpcETH(expandDecimals(299, 18), expandDecimals(300, 18), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("XpcManager: insufficient XPC output")

    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(vault.address)).eq(0)
    expect(await bnb.totalSupply()).eq(0)
    expect(await provider.getBalance(bnb.address)).eq(0)
    expect(await stakedXpcTracker.balanceOf(user0.address)).eq(0)

    await rewardRouter.connect(user0).mintAndStakeXpcETH(expandDecimals(299, 18), expandDecimals(299, 18), { value: expandDecimals(1, 18) })

    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(vault.address)).eq(expandDecimals(1, 18))
    expect(await provider.getBalance(bnb.address)).eq(expandDecimals(1, 18))
    expect(await bnb.totalSupply()).eq(expandDecimals(1, 18))
    expect(await stakedXpcTracker.balanceOf(user0.address)).eq("299100000000000000000") // 299.1

    await expect(rewardRouter.connect(user0).unstakeAndRedeemXpcETH(expandDecimals(300, 18), expandDecimals(1, 18), receiver0.address))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    await expect(rewardRouter.connect(user0).unstakeAndRedeemXpcETH("299100000000000000000", expandDecimals(1, 18), receiver0.address))
      .to.be.revertedWith("XpcManager: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)

    await expect(rewardRouter.connect(user0).unstakeAndRedeemXpcETH("299100000000000000000", expandDecimals(1, 18), receiver0.address))
      .to.be.revertedWith("XpcManager: insufficient output")

    await rewardRouter.connect(user0).unstakeAndRedeemXpcETH("299100000000000000000", "990000000000000000", receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq("994009000000000000") // 0.994009
    expect(await bnb.balanceOf(vault.address)).eq("5991000000000000") // 0.005991
    expect(await provider.getBalance(bnb.address)).eq("5991000000000000")
    expect(await bnb.totalSupply()).eq("5991000000000000")
  })

  it("opec: signalTransfer, acceptTransfer", async () =>{
    await opec.setMinter(wallet.address, true)
    await opec.mint(user1.address, expandDecimals(200, 18))
    expect(await opec.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await opec.connect(user1).approve(stakedOpecTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeOpec(expandDecimals(200, 18))
    expect(await opec.balanceOf(user1.address)).eq(0)

    await opec.mint(user2.address, expandDecimals(200, 18))
    expect(await opec.balanceOf(user2.address)).eq(expandDecimals(200, 18))
    await opec.connect(user2).approve(stakedOpecTracker.address, expandDecimals(400, 18))
    await rewardRouter.connect(user2).stakeOpec(expandDecimals(200, 18))
    expect(await opec.balanceOf(user2.address)).eq(0)

    await rewardRouter.connect(user2).signalTransfer(user1.address)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user2).signalTransfer(user1.address)
    await rewardRouter.connect(user1).claim()

    await expect(rewardRouter.connect(user2).signalTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: stakedOpecTracker.averageStakedAmounts > 0")

    await rewardRouter.connect(user2).signalTransfer(user3.address)

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")

    await opecVester.setBonusRewards(user2.address, expandDecimals(100, 18))

    expect(await stakedOpecTracker.depositBalances(user2.address, opec.address)).eq(expandDecimals(200, 18))
    expect(await stakedOpecTracker.depositBalances(user2.address, esOpec.address)).eq(0)
    expect(await feeOpecTracker.depositBalances(user2.address, bnOpec.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user3.address, opec.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user3.address, esOpec.address)).eq(0)
    expect(await feeOpecTracker.depositBalances(user3.address, bnOpec.address)).eq(0)
    expect(await opecVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await opecVester.transferredCumulativeRewards(user3.address)).eq(0)
    expect(await opecVester.bonusRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await opecVester.bonusRewards(user3.address)).eq(0)
    expect(await opecVester.getCombinedAverageStakedAmount(user2.address)).eq(0)
    expect(await opecVester.getCombinedAverageStakedAmount(user3.address)).eq(0)
    expect(await opecVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await opecVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await opecVester.getPairAmount(user2.address, expandDecimals(892, 18))).eq(0)
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(892, 18))).eq(0)

    await rewardRouter.connect(user3).acceptTransfer(user2.address)

    expect(await stakedOpecTracker.depositBalances(user2.address, opec.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user2.address, esOpec.address)).eq(0)
    expect(await feeOpecTracker.depositBalances(user2.address, bnOpec.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user3.address, opec.address)).eq(expandDecimals(200, 18))
    expect(await stakedOpecTracker.depositBalances(user3.address, esOpec.address)).gt(expandDecimals(892, 18))
    expect(await stakedOpecTracker.depositBalances(user3.address, esOpec.address)).lt(expandDecimals(893, 18))
    expect(await feeOpecTracker.depositBalances(user3.address, bnOpec.address)).gt("547000000000000000") // 0.547
    expect(await feeOpecTracker.depositBalances(user3.address, bnOpec.address)).lt("549000000000000000") // 0.548
    expect(await opecVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await opecVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await opecVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await opecVester.bonusRewards(user2.address)).eq(0)
    expect(await opecVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user3.address)).eq(expandDecimals(200, 18))
    expect(await opecVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await opecVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(992, 18))
    expect(await opecVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(993, 18))
    expect(await opecVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))

    await opec.connect(user3).approve(stakedOpecTracker.address, expandDecimals(400, 18))
    await rewardRouter.connect(user3).signalTransfer(user4.address)
    await rewardRouter.connect(user4).acceptTransfer(user3.address)

    expect(await stakedOpecTracker.depositBalances(user3.address, opec.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user3.address, esOpec.address)).eq(0)
    expect(await feeOpecTracker.depositBalances(user3.address, bnOpec.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user4.address, opec.address)).eq(expandDecimals(200, 18))
    expect(await stakedOpecTracker.depositBalances(user4.address, esOpec.address)).gt(expandDecimals(892, 18))
    expect(await stakedOpecTracker.depositBalances(user4.address, esOpec.address)).lt(expandDecimals(893, 18))
    expect(await feeOpecTracker.depositBalances(user4.address, bnOpec.address)).gt("547000000000000000") // 0.547
    expect(await feeOpecTracker.depositBalances(user4.address, bnOpec.address)).lt("549000000000000000") // 0.548
    expect(await opecVester.transferredAverageStakedAmounts(user4.address)).gt(expandDecimals(200, 18))
    expect(await opecVester.transferredAverageStakedAmounts(user4.address)).lt(expandDecimals(201, 18))
    expect(await opecVester.transferredCumulativeRewards(user4.address)).gt(expandDecimals(892, 18))
    expect(await opecVester.transferredCumulativeRewards(user4.address)).lt(expandDecimals(894, 18))
    expect(await opecVester.bonusRewards(user3.address)).eq(0)
    expect(await opecVester.bonusRewards(user4.address)).eq(expandDecimals(100, 18))
    expect(await stakedOpecTracker.averageStakedAmounts(user3.address)).gt(expandDecimals(1092, 18))
    expect(await stakedOpecTracker.averageStakedAmounts(user3.address)).lt(expandDecimals(1094, 18))
    expect(await opecVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await opecVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1094, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user4.address)).gt(expandDecimals(200, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user4.address)).lt(expandDecimals(201, 18))
    expect(await opecVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await opecVester.getMaxVestableAmount(user4.address)).gt(expandDecimals(992, 18))
    expect(await opecVester.getMaxVestableAmount(user4.address)).lt(expandDecimals(993, 18))
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(992, 18))).eq(0)
    expect(await opecVester.getPairAmount(user4.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await opecVester.getPairAmount(user4.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))

    await expect(rewardRouter.connect(user4).acceptTransfer(user3.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")
  })

  it("opec, xpc: signalTransfer, acceptTransfer", async () =>{
    await opec.setMinter(wallet.address, true)
    await opec.mint(opecVester.address, expandDecimals(10000, 18))
    await opec.mint(xpcVester.address, expandDecimals(10000, 18))
    await eth.mint(feeXpcDistributor.address, expandDecimals(100, 18))
    await feeXpcDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(xpcManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user1).mintAndStakeXpc(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await bnb.mint(user2.address, expandDecimals(1, 18))
    await bnb.connect(user2).approve(xpcManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user2).mintAndStakeXpc(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await opec.mint(user1.address, expandDecimals(200, 18))
    expect(await opec.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await opec.connect(user1).approve(stakedOpecTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeOpec(expandDecimals(200, 18))
    expect(await opec.balanceOf(user1.address)).eq(0)

    await opec.mint(user2.address, expandDecimals(200, 18))
    expect(await opec.balanceOf(user2.address)).eq(expandDecimals(200, 18))
    await opec.connect(user2).approve(stakedOpecTracker.address, expandDecimals(400, 18))
    await rewardRouter.connect(user2).stakeOpec(expandDecimals(200, 18))
    expect(await opec.balanceOf(user2.address)).eq(0)

    await rewardRouter.connect(user2).signalTransfer(user1.address)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user2).signalTransfer(user1.address)
    await rewardRouter.connect(user1).compound()

    await expect(rewardRouter.connect(user2).signalTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: stakedOpecTracker.averageStakedAmounts > 0")

    await rewardRouter.connect(user2).signalTransfer(user3.address)

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")

    await opecVester.setBonusRewards(user2.address, expandDecimals(100, 18))

    expect(await stakedOpecTracker.depositBalances(user2.address, opec.address)).eq(expandDecimals(200, 18))
    expect(await stakedOpecTracker.depositBalances(user2.address, esOpec.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user3.address, opec.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user3.address, esOpec.address)).eq(0)

    expect(await feeOpecTracker.depositBalances(user2.address, bnOpec.address)).eq(0)
    expect(await feeOpecTracker.depositBalances(user3.address, bnOpec.address)).eq(0)

    expect(await feeXpcTracker.depositBalances(user2.address, xpc.address)).eq("299100000000000000000") // 299.1
    expect(await feeXpcTracker.depositBalances(user3.address, xpc.address)).eq(0)

    expect(await stakedXpcTracker.depositBalances(user2.address, feeXpcTracker.address)).eq("299100000000000000000") // 299.1
    expect(await stakedXpcTracker.depositBalances(user3.address, feeXpcTracker.address)).eq(0)

    expect(await opecVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await opecVester.transferredCumulativeRewards(user3.address)).eq(0)
    expect(await opecVester.bonusRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await opecVester.bonusRewards(user3.address)).eq(0)
    expect(await opecVester.getCombinedAverageStakedAmount(user2.address)).eq(0)
    expect(await opecVester.getCombinedAverageStakedAmount(user3.address)).eq(0)
    expect(await opecVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await opecVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await opecVester.getPairAmount(user2.address, expandDecimals(892, 18))).eq(0)
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(892, 18))).eq(0)

    await rewardRouter.connect(user3).acceptTransfer(user2.address)

    expect(await stakedOpecTracker.depositBalances(user2.address, opec.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user2.address, esOpec.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user3.address, opec.address)).eq(expandDecimals(200, 18))
    expect(await stakedOpecTracker.depositBalances(user3.address, esOpec.address)).gt(expandDecimals(1785, 18))
    expect(await stakedOpecTracker.depositBalances(user3.address, esOpec.address)).lt(expandDecimals(1786, 18))

    expect(await feeOpecTracker.depositBalances(user2.address, bnOpec.address)).eq(0)
    expect(await feeOpecTracker.depositBalances(user3.address, bnOpec.address)).gt("547000000000000000") // 0.547
    expect(await feeOpecTracker.depositBalances(user3.address, bnOpec.address)).lt("549000000000000000") // 0.548

    expect(await feeXpcTracker.depositBalances(user2.address, xpc.address)).eq(0)
    expect(await feeXpcTracker.depositBalances(user3.address, xpc.address)).eq("299100000000000000000") // 299.1

    expect(await stakedXpcTracker.depositBalances(user2.address, feeXpcTracker.address)).eq(0)
    expect(await stakedXpcTracker.depositBalances(user3.address, feeXpcTracker.address)).eq("299100000000000000000") // 299.1

    expect(await opecVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await opecVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await opecVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await opecVester.bonusRewards(user2.address)).eq(0)
    expect(await opecVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user3.address)).eq(expandDecimals(200, 18))
    expect(await opecVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await opecVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(992, 18))
    expect(await opecVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(993, 18))
    expect(await opecVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))
    expect(await opecVester.getPairAmount(user1.address, expandDecimals(892, 18))).gt(expandDecimals(199, 18))
    expect(await opecVester.getPairAmount(user1.address, expandDecimals(892, 18))).lt(expandDecimals(200, 18))

    await rewardRouter.connect(user1).compound()

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user1).claim()
    await rewardRouter.connect(user2).claim()
    await rewardRouter.connect(user3).claim()

    expect(await opecVester.getCombinedAverageStakedAmount(user1.address)).gt(expandDecimals(1092, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user1.address)).lt(expandDecimals(1094, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1094, 18))

    expect(await opecVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await opecVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1885, 18))
    expect(await opecVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1887, 18))
    expect(await opecVester.getMaxVestableAmount(user1.address)).gt(expandDecimals(1785, 18))
    expect(await opecVester.getMaxVestableAmount(user1.address)).lt(expandDecimals(1787, 18))

    expect(await opecVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(1885, 18))).gt(expandDecimals(1092, 18))
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(1885, 18))).lt(expandDecimals(1094, 18))
    expect(await opecVester.getPairAmount(user1.address, expandDecimals(1785, 18))).gt(expandDecimals(1092, 18))
    expect(await opecVester.getPairAmount(user1.address, expandDecimals(1785, 18))).lt(expandDecimals(1094, 18))

    await rewardRouter.connect(user1).compound()
    await rewardRouter.connect(user3).compound()

    expect(await feeOpecTracker.balanceOf(user1.address)).gt(expandDecimals(1992, 18))
    expect(await feeOpecTracker.balanceOf(user1.address)).lt(expandDecimals(1993, 18))

    await opecVester.connect(user1).deposit(expandDecimals(1785, 18))

    expect(await feeOpecTracker.balanceOf(user1.address)).gt(expandDecimals(1991 - 1092, 18)) // 899
    expect(await feeOpecTracker.balanceOf(user1.address)).lt(expandDecimals(1993 - 1092, 18)) // 901

    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt(expandDecimals(4, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt(expandDecimals(6, 18))

    await rewardRouter.connect(user1).unstakeOpec(expandDecimals(200, 18))
    await expect(rewardRouter.connect(user1).unstakeEsOpec(expandDecimals(699, 18)))
      .to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await rewardRouter.connect(user1).unstakeEsOpec(expandDecimals(599, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await feeOpecTracker.balanceOf(user1.address)).gt(expandDecimals(97, 18))
    expect(await feeOpecTracker.balanceOf(user1.address)).lt(expandDecimals(99, 18))

    expect(await esOpec.balanceOf(user1.address)).gt(expandDecimals(599, 18))
    expect(await esOpec.balanceOf(user1.address)).lt(expandDecimals(601, 18))

    expect(await opec.balanceOf(user1.address)).eq(expandDecimals(200, 18))

    await opecVester.connect(user1).withdraw()

    expect(await feeOpecTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18)) // 1190 - 98 => 1092
    expect(await feeOpecTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await esOpec.balanceOf(user1.address)).gt(expandDecimals(2378, 18))
    expect(await esOpec.balanceOf(user1.address)).lt(expandDecimals(2380, 18))

    expect(await opec.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await opec.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    expect(await xpcVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1785, 18))
    expect(await xpcVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1787, 18))

    expect(await xpcVester.getPairAmount(user3.address, expandDecimals(1785, 18))).gt(expandDecimals(298, 18))
    expect(await xpcVester.getPairAmount(user3.address, expandDecimals(1785, 18))).lt(expandDecimals(300, 18))

    expect(await stakedXpcTracker.balanceOf(user3.address)).eq("299100000000000000000")

    expect(await esOpec.balanceOf(user3.address)).gt(expandDecimals(1785, 18))
    expect(await esOpec.balanceOf(user3.address)).lt(expandDecimals(1787, 18))

    expect(await opec.balanceOf(user3.address)).eq(0)

    await xpcVester.connect(user3).deposit(expandDecimals(1785, 18))

    expect(await stakedXpcTracker.balanceOf(user3.address)).gt(0)
    expect(await stakedXpcTracker.balanceOf(user3.address)).lt(expandDecimals(1, 18))

    expect(await esOpec.balanceOf(user3.address)).gt(0)
    expect(await esOpec.balanceOf(user3.address)).lt(expandDecimals(1, 18))

    expect(await opec.balanceOf(user3.address)).eq(0)

    await expect(rewardRouter.connect(user3).unstakeAndRedeemXpc(
      bnb.address,
      expandDecimals(1, 18),
      0,
      user3.address
    )).to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await xpcVester.connect(user3).withdraw()

    expect(await stakedXpcTracker.balanceOf(user3.address)).eq("299100000000000000000")

    expect(await esOpec.balanceOf(user3.address)).gt(expandDecimals(1785 - 5, 18))
    expect(await esOpec.balanceOf(user3.address)).lt(expandDecimals(1787 - 5, 18))

    expect(await opec.balanceOf(user3.address)).gt(expandDecimals(4, 18))
    expect(await opec.balanceOf(user3.address)).lt(expandDecimals(6, 18))

    expect(await feeOpecTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18))
    expect(await feeOpecTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await esOpec.balanceOf(user1.address)).gt(expandDecimals(2379, 18))
    expect(await esOpec.balanceOf(user1.address)).lt(expandDecimals(2381, 18))

    expect(await opec.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await opec.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    await opecVester.connect(user1).deposit(expandDecimals(365 * 2, 18))

    expect(await feeOpecTracker.balanceOf(user1.address)).gt(expandDecimals(743, 18)) // 1190 - 743 => 447
    expect(await feeOpecTracker.balanceOf(user1.address)).lt(expandDecimals(754, 18))

    expect(await opecVester.claimable(user1.address)).eq(0)

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await opecVester.claimable(user1.address)).gt("3900000000000000000") // 3.9
    expect(await opecVester.claimable(user1.address)).lt("4100000000000000000") // 4.1

    await opecVester.connect(user1).deposit(expandDecimals(365, 18))

    expect(await feeOpecTracker.balanceOf(user1.address)).gt(expandDecimals(522, 18)) // 743 - 522 => 221
    expect(await feeOpecTracker.balanceOf(user1.address)).lt(expandDecimals(524, 18))

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await opecVester.claimable(user1.address)).gt("9900000000000000000") // 9.9
    expect(await opecVester.claimable(user1.address)).lt("10100000000000000000") // 10.1

    expect(await opec.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await opec.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    await opecVester.connect(user1).claim()

    expect(await opec.balanceOf(user1.address)).gt(expandDecimals(214, 18))
    expect(await opec.balanceOf(user1.address)).lt(expandDecimals(216, 18))

    await opecVester.connect(user1).deposit(expandDecimals(365, 18))
    expect(await opecVester.balanceOf(user1.address)).gt(expandDecimals(1449, 18)) // 365 * 4 => 1460, 1460 - 10 => 1450
    expect(await opecVester.balanceOf(user1.address)).lt(expandDecimals(1451, 18))
    expect(await opecVester.getVestedAmount(user1.address)).eq(expandDecimals(1460, 18))

    expect(await feeOpecTracker.balanceOf(user1.address)).gt(expandDecimals(303, 18)) // 522 - 303 => 219
    expect(await feeOpecTracker.balanceOf(user1.address)).lt(expandDecimals(304, 18))

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await opecVester.claimable(user1.address)).gt("7900000000000000000") // 7.9
    expect(await opecVester.claimable(user1.address)).lt("8100000000000000000") // 8.1

    await opecVester.connect(user1).withdraw()

    expect(await feeOpecTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18))
    expect(await feeOpecTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await opec.balanceOf(user1.address)).gt(expandDecimals(222, 18))
    expect(await opec.balanceOf(user1.address)).lt(expandDecimals(224, 18))

    expect(await esOpec.balanceOf(user1.address)).gt(expandDecimals(2360, 18))
    expect(await esOpec.balanceOf(user1.address)).lt(expandDecimals(2362, 18))

    await opecVester.connect(user1).deposit(expandDecimals(365, 18))

    await increaseTime(provider, 500 * 24 * 60 * 60)
    await mineBlock(provider)

    expect(await opecVester.claimable(user1.address)).eq(expandDecimals(365, 18))

    await opecVester.connect(user1).withdraw()

    expect(await opec.balanceOf(user1.address)).gt(expandDecimals(222 + 365, 18))
    expect(await opec.balanceOf(user1.address)).lt(expandDecimals(224 + 365, 18))

    expect(await esOpec.balanceOf(user1.address)).gt(expandDecimals(2360 - 365, 18))
    expect(await esOpec.balanceOf(user1.address)).lt(expandDecimals(2362 - 365, 18))

    expect(await opecVester.transferredAverageStakedAmounts(user2.address)).eq(0)
    expect(await opecVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await stakedOpecTracker.cumulativeRewards(user2.address)).gt(expandDecimals(892, 18))
    expect(await stakedOpecTracker.cumulativeRewards(user2.address)).lt(expandDecimals(893, 18))
    expect(await stakedOpecTracker.cumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await stakedOpecTracker.cumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await opecVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await opecVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await opecVester.bonusRewards(user2.address)).eq(0)
    expect(await opecVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1093, 18))
    expect(await opecVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await opecVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1884, 18))
    expect(await opecVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1886, 18))
    expect(await opecVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(574, 18))
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(575, 18))
    expect(await opecVester.getPairAmount(user1.address, expandDecimals(892, 18))).gt(expandDecimals(545, 18))
    expect(await opecVester.getPairAmount(user1.address, expandDecimals(892, 18))).lt(expandDecimals(546, 18))

    const esOpecBatchSender = await deployContract("EsOpecBatchSender", [esOpec.address])

    await timelock.signalSetHandler(esOpec.address, esOpecBatchSender.address, true)
    await timelock.signalSetHandler(opecVester.address, esOpecBatchSender.address, true)
    await timelock.signalSetHandler(xpcVester.address, esOpecBatchSender.address, true)
    await timelock.signalMint(esOpec.address, wallet.address, expandDecimals(1000, 18))

    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.setHandler(esOpec.address, esOpecBatchSender.address, true)
    await timelock.setHandler(opecVester.address, esOpecBatchSender.address, true)
    await timelock.setHandler(xpcVester.address, esOpecBatchSender.address, true)
    await timelock.processMint(esOpec.address, wallet.address, expandDecimals(1000, 18))

    await esOpecBatchSender.connect(wallet).send(
      opecVester.address,
      4,
      [user2.address, user3.address],
      [expandDecimals(100, 18), expandDecimals(200, 18)]
    )

    expect(await opecVester.transferredAverageStakedAmounts(user2.address)).gt(expandDecimals(37648, 18))
    expect(await opecVester.transferredAverageStakedAmounts(user2.address)).lt(expandDecimals(37649, 18))
    expect(await opecVester.transferredAverageStakedAmounts(user3.address)).gt(expandDecimals(12810, 18))
    expect(await opecVester.transferredAverageStakedAmounts(user3.address)).lt(expandDecimals(12811, 18))
    expect(await opecVester.transferredCumulativeRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await opecVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892 + 200, 18))
    expect(await opecVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893 + 200, 18))
    expect(await opecVester.bonusRewards(user2.address)).eq(0)
    expect(await opecVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user2.address)).gt(expandDecimals(3971, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user2.address)).lt(expandDecimals(3972, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(7943, 18))
    expect(await opecVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(7944, 18))
    expect(await opecVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await opecVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1884 + 200, 18))
    expect(await opecVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1886 + 200, 18))
    expect(await opecVester.getPairAmount(user2.address, expandDecimals(100, 18))).gt(expandDecimals(3971, 18))
    expect(await opecVester.getPairAmount(user2.address, expandDecimals(100, 18))).lt(expandDecimals(3972, 18))
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(1884 + 200, 18))).gt(expandDecimals(7936, 18))
    expect(await opecVester.getPairAmount(user3.address, expandDecimals(1884 + 200, 18))).lt(expandDecimals(7937, 18))

    expect(await xpcVester.transferredAverageStakedAmounts(user4.address)).eq(0)
    expect(await xpcVester.transferredCumulativeRewards(user4.address)).eq(0)
    expect(await xpcVester.bonusRewards(user4.address)).eq(0)
    expect(await xpcVester.getCombinedAverageStakedAmount(user4.address)).eq(0)
    expect(await xpcVester.getMaxVestableAmount(user4.address)).eq(0)
    expect(await xpcVester.getPairAmount(user4.address, expandDecimals(10, 18))).eq(0)

    await esOpecBatchSender.connect(wallet).send(
      xpcVester.address,
      320,
      [user4.address],
      [expandDecimals(10, 18)]
    )

    expect(await xpcVester.transferredAverageStakedAmounts(user4.address)).eq(expandDecimals(3200, 18))
    expect(await xpcVester.transferredCumulativeRewards(user4.address)).eq(expandDecimals(10, 18))
    expect(await xpcVester.bonusRewards(user4.address)).eq(0)
    expect(await xpcVester.getCombinedAverageStakedAmount(user4.address)).eq(expandDecimals(3200, 18))
    expect(await xpcVester.getMaxVestableAmount(user4.address)).eq(expandDecimals(10, 18))
    expect(await xpcVester.getPairAmount(user4.address, expandDecimals(10, 18))).eq(expandDecimals(3200, 18))

    await esOpecBatchSender.connect(wallet).send(
      xpcVester.address,
      320,
      [user4.address],
      [expandDecimals(10, 18)]
    )

    expect(await xpcVester.transferredAverageStakedAmounts(user4.address)).eq(expandDecimals(6400, 18))
    expect(await xpcVester.transferredCumulativeRewards(user4.address)).eq(expandDecimals(20, 18))
    expect(await xpcVester.bonusRewards(user4.address)).eq(0)
    expect(await xpcVester.getCombinedAverageStakedAmount(user4.address)).eq(expandDecimals(6400, 18))
    expect(await xpcVester.getMaxVestableAmount(user4.address)).eq(expandDecimals(20, 18))
    expect(await xpcVester.getPairAmount(user4.address, expandDecimals(10, 18))).eq(expandDecimals(3200, 18))
  })

  it("handleRewards", async () => {
    const rewardManagerV2 = await deployContract("RewardManager", [])
    const timelockV2 = await deployContract("Timelock", [
      wallet.address,
      10,
      rewardManagerV2.address,
      tokenManager.address,
      tokenManager.address,
      expandDecimals(1000000, 18),
      10,
      100
    ])

    // use new rewardRouter, use eth for weth
    const rewardRouterV2 = await deployContract("RewardRouterV2", [])
    await rewardRouterV2.initialize(
      eth.address,
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
    )

    await rewardManagerV2.initialize(
      timelockV2.address,
      rewardRouterV2.address,
      xpcManager.address,
      stakedOpecTracker.address,
      bonusOpecTracker.address,
      feeOpecTracker.address,
      feeXpcTracker.address,
      stakedXpcTracker.address,
      stakedOpecDistributor.address,
      stakedXpcDistributor.address,
      esOpec.address,
      bnOpec.address,
      opecVester.address,
      xpcVester.address
    )

    await timelock.signalSetGov(xpcManager.address, timelockV2.address)
    await timelock.signalSetGov(stakedOpecTracker.address, timelockV2.address)
    await timelock.signalSetGov(bonusOpecTracker.address, timelockV2.address)
    await timelock.signalSetGov(feeOpecTracker.address, timelockV2.address)
    await timelock.signalSetGov(feeXpcTracker.address, timelockV2.address)
    await timelock.signalSetGov(stakedXpcTracker.address, timelockV2.address)
    await timelock.signalSetGov(stakedOpecDistributor.address, timelockV2.address)
    await timelock.signalSetGov(stakedXpcDistributor.address, timelockV2.address)
    await timelock.signalSetGov(esOpec.address, timelockV2.address)
    await timelock.signalSetGov(bnOpec.address, timelockV2.address)
    await timelock.signalSetGov(opecVester.address, timelockV2.address)
    await timelock.signalSetGov(xpcVester.address, timelockV2.address)

    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.setGov(xpcManager.address, timelockV2.address)
    await timelock.setGov(stakedOpecTracker.address, timelockV2.address)
    await timelock.setGov(bonusOpecTracker.address, timelockV2.address)
    await timelock.setGov(feeOpecTracker.address, timelockV2.address)
    await timelock.setGov(feeXpcTracker.address, timelockV2.address)
    await timelock.setGov(stakedXpcTracker.address, timelockV2.address)
    await timelock.setGov(stakedOpecDistributor.address, timelockV2.address)
    await timelock.setGov(stakedXpcDistributor.address, timelockV2.address)
    await timelock.setGov(esOpec.address, timelockV2.address)
    await timelock.setGov(bnOpec.address, timelockV2.address)
    await timelock.setGov(opecVester.address, timelockV2.address)
    await timelock.setGov(xpcVester.address, timelockV2.address)

    await rewardManagerV2.updateEsOpecHandlers()
    await rewardManagerV2.enableRewardRouter()

    await eth.deposit({ value: expandDecimals(10, 18) })

    await opec.setMinter(wallet.address, true)
    await opec.mint(opecVester.address, expandDecimals(10000, 18))
    await opec.mint(xpcVester.address, expandDecimals(10000, 18))

    await eth.mint(feeXpcDistributor.address, expandDecimals(50, 18))
    await feeXpcDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await eth.mint(feeOpecDistributor.address, expandDecimals(50, 18))
    await feeOpecDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(xpcManager.address, expandDecimals(1, 18))
    await rewardRouterV2.connect(user1).mintAndStakeXpc(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await opec.mint(user1.address, expandDecimals(200, 18))
    expect(await opec.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await opec.connect(user1).approve(stakedOpecTracker.address, expandDecimals(200, 18))
    await rewardRouterV2.connect(user1).stakeOpec(expandDecimals(200, 18))
    expect(await opec.balanceOf(user1.address)).eq(0)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await opec.balanceOf(user1.address)).eq(0)
    expect(await esOpec.balanceOf(user1.address)).eq(0)
    expect(await bnOpec.balanceOf(user1.address)).eq(0)
    expect(await xpc.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).eq(0)

    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(200, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).eq(0)
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).eq(0)

    await rewardRouterV2.connect(user1).handleRewards(
      true, // _shouldClaimOpec
      true, // _shouldStakeOpec
      true, // _shouldClaimEsOpec
      true, // _shouldStakeEsOpec
      true, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await opec.balanceOf(user1.address)).eq(0)
    expect(await esOpec.balanceOf(user1.address)).eq(0)
    expect(await bnOpec.balanceOf(user1.address)).eq(0)
    expect(await xpc.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(200, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).gt(expandDecimals(3571, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).lt(expandDecimals(3572, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("540000000000000000") // 0.54
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("560000000000000000") // 0.56

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const ethBalance0 = await provider.getBalance(user1.address)

    await rewardRouterV2.connect(user1).handleRewards(
      false, // _shouldClaimOpec
      false, // _shouldStakeOpec
      false, // _shouldClaimEsOpec
      false, // _shouldStakeEsOpec
      false, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      true // _shouldConvertWethToEth
    )

    const ethBalance1 = await provider.getBalance(user1.address)

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await opec.balanceOf(user1.address)).eq(0)
    expect(await esOpec.balanceOf(user1.address)).eq(0)
    expect(await bnOpec.balanceOf(user1.address)).eq(0)
    expect(await xpc.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(200, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).gt(expandDecimals(3571, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).lt(expandDecimals(3572, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("540000000000000000") // 0.54
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("560000000000000000") // 0.56

    await rewardRouterV2.connect(user1).handleRewards(
      false, // _shouldClaimOpec
      false, // _shouldStakeOpec
      true, // _shouldClaimEsOpec
      false, // _shouldStakeEsOpec
      false, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await opec.balanceOf(user1.address)).eq(0)
    expect(await esOpec.balanceOf(user1.address)).gt(expandDecimals(3571, 18))
    expect(await esOpec.balanceOf(user1.address)).lt(expandDecimals(3572, 18))
    expect(await bnOpec.balanceOf(user1.address)).eq(0)
    expect(await xpc.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(200, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).gt(expandDecimals(3571, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).lt(expandDecimals(3572, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("540000000000000000") // 0.54
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("560000000000000000") // 0.56

    await opecVester.connect(user1).deposit(expandDecimals(365, 18))
    await xpcVester.connect(user1).deposit(expandDecimals(365 * 2, 18))

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await opec.balanceOf(user1.address)).eq(0)
    expect(await esOpec.balanceOf(user1.address)).gt(expandDecimals(3571 - 365 * 3, 18))
    expect(await esOpec.balanceOf(user1.address)).lt(expandDecimals(3572 - 365 * 3, 18))
    expect(await bnOpec.balanceOf(user1.address)).eq(0)
    expect(await xpc.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(200, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).gt(expandDecimals(3571, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).lt(expandDecimals(3572, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("540000000000000000") // 0.54
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("560000000000000000") // 0.56

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouterV2.connect(user1).handleRewards(
      true, // _shouldClaimOpec
      false, // _shouldStakeOpec
      false, // _shouldClaimEsOpec
      false, // _shouldStakeEsOpec
      false, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await opec.balanceOf(user1.address)).gt("2900000000000000000") // 2.9
    expect(await opec.balanceOf(user1.address)).lt("3100000000000000000") // 3.1
    expect(await esOpec.balanceOf(user1.address)).gt(expandDecimals(3571 - 365 * 3, 18))
    expect(await esOpec.balanceOf(user1.address)).lt(expandDecimals(3572 - 365 * 3, 18))
    expect(await bnOpec.balanceOf(user1.address)).eq(0)
    expect(await xpc.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(200, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).gt(expandDecimals(3571, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).lt(expandDecimals(3572, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("540000000000000000") // 0.54
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("560000000000000000") // 0.56
  })

  it("StakedXpc", async () => {
    await eth.mint(feeXpcDistributor.address, expandDecimals(100, 18))
    await feeXpcDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(xpcManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user1).mintAndStakeXpc(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXpcTracker.depositBalances(user1.address, xpc.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXpcTracker.depositBalances(user1.address, feeXpcTracker.address)).eq(expandDecimals(2991, 17))

    const stakedXpc = await deployContract("StakedXpc", [xpc.address, xpcManager.address, stakedXpcTracker.address, feeXpcTracker.address])

    await expect(stakedXpc.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("StakedXpc: transfer amount exceeds allowance")

    await stakedXpc.connect(user1).approve(user2.address, expandDecimals(2991, 17))

    await expect(stakedXpc.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("StakedXpc: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(stakedXpc.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("RewardTracker: forbidden")

    await timelock.signalSetHandler(stakedXpcTracker.address, stakedXpc.address, true)
    await increaseTime(provider, 20)
    await mineBlock(provider)
    await timelock.setHandler(stakedXpcTracker.address, stakedXpc.address, true)

    await expect(stakedXpc.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("RewardTracker: forbidden")

    await timelock.signalSetHandler(feeXpcTracker.address, stakedXpc.address, true)
    await increaseTime(provider, 20)
    await mineBlock(provider)
    await timelock.setHandler(feeXpcTracker.address, stakedXpc.address, true)

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXpcTracker.depositBalances(user1.address, xpc.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXpcTracker.depositBalances(user1.address, feeXpcTracker.address)).eq(expandDecimals(2991, 17))

    expect(await feeXpcTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeXpcTracker.depositBalances(user3.address, xpc.address)).eq(0)

    expect(await stakedXpcTracker.stakedAmounts(user3.address)).eq(0)
    expect(await stakedXpcTracker.depositBalances(user3.address, feeXpcTracker.address)).eq(0)

    await stakedXpc.connect(user2).transferFrom(user1.address, user3. address, expandDecimals(2991, 17))

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq(0)
    expect(await feeXpcTracker.depositBalances(user1.address, xpc.address)).eq(0)

    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq(0)
    expect(await stakedXpcTracker.depositBalances(user1.address, feeXpcTracker.address)).eq(0)

    expect(await feeXpcTracker.stakedAmounts(user3.address)).eq(expandDecimals(2991, 17))
    expect(await feeXpcTracker.depositBalances(user3.address, xpc.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXpcTracker.stakedAmounts(user3.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXpcTracker.depositBalances(user3.address, feeXpcTracker.address)).eq(expandDecimals(2991, 17))

    await expect(stakedXpc.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(3000, 17)))
      .to.be.revertedWith("StakedXpc: transfer amount exceeds allowance")

    await stakedXpc.connect(user3).approve(user2.address, expandDecimals(3000, 17))

    await expect(stakedXpc.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(3000, 17)))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    await stakedXpc.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(1000, 17))

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 17))
    expect(await feeXpcTracker.depositBalances(user1.address, xpc.address)).eq(expandDecimals(1000, 17))

    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 17))
    expect(await stakedXpcTracker.depositBalances(user1.address, feeXpcTracker.address)).eq(expandDecimals(1000, 17))

    expect(await feeXpcTracker.stakedAmounts(user3.address)).eq(expandDecimals(1991, 17))
    expect(await feeXpcTracker.depositBalances(user3.address, xpc.address)).eq(expandDecimals(1991, 17))

    expect(await stakedXpcTracker.stakedAmounts(user3.address)).eq(expandDecimals(1991, 17))
    expect(await stakedXpcTracker.depositBalances(user3.address, feeXpcTracker.address)).eq(expandDecimals(1991, 17))

    await stakedXpc.connect(user3).transfer(user1.address, expandDecimals(1500, 17))

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2500, 17))
    expect(await feeXpcTracker.depositBalances(user1.address, xpc.address)).eq(expandDecimals(2500, 17))

    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2500, 17))
    expect(await stakedXpcTracker.depositBalances(user1.address, feeXpcTracker.address)).eq(expandDecimals(2500, 17))

    expect(await feeXpcTracker.stakedAmounts(user3.address)).eq(expandDecimals(491, 17))
    expect(await feeXpcTracker.depositBalances(user3.address, xpc.address)).eq(expandDecimals(491, 17))

    expect(await stakedXpcTracker.stakedAmounts(user3.address)).eq(expandDecimals(491, 17))
    expect(await stakedXpcTracker.depositBalances(user3.address, feeXpcTracker.address)).eq(expandDecimals(491, 17))

    await expect(stakedXpc.connect(user3).transfer(user1.address, expandDecimals(492, 17)))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    expect(await bnb.balanceOf(user1.address)).eq(0)

    await rewardRouter.connect(user1).unstakeAndRedeemXpc(
      bnb.address,
      expandDecimals(2500, 17),
      "830000000000000000", // 0.83
      user1.address
    )

    expect(await bnb.balanceOf(user1.address)).eq("830833333333333333")

    await usdg.addVault(xpcManager.address)

    expect(await bnb.balanceOf(user3.address)).eq("0")

    await rewardRouter.connect(user3).unstakeAndRedeemXpc(
      bnb.address,
      expandDecimals(491, 17),
      "160000000000000000", // 0.16
      user3.address
    )

    expect(await bnb.balanceOf(user3.address)).eq("163175666666666666")
  })

  it("FeeXpc", async () => {
    await eth.mint(feeXpcDistributor.address, expandDecimals(100, 18))
    await feeXpcDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(xpcManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user1).mintAndStakeXpc(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXpcTracker.depositBalances(user1.address, xpc.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXpcTracker.depositBalances(user1.address, feeXpcTracker.address)).eq(expandDecimals(2991, 17))

    const xpcBalance = await deployContract("XpcBalance", [xpcManager.address, stakedXpcTracker.address])

    await expect(xpcBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("XpcBalance: transfer amount exceeds allowance")

    await xpcBalance.connect(user1).approve(user2.address, expandDecimals(2991, 17))

    await expect(xpcBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("XpcBalance: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(xpcBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds allowance")

    await timelock.signalSetHandler(stakedXpcTracker.address, xpcBalance.address, true)
    await increaseTime(provider, 20)
    await mineBlock(provider)
    await timelock.setHandler(stakedXpcTracker.address, xpcBalance.address, true)

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXpcTracker.depositBalances(user1.address, xpc.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXpcTracker.depositBalances(user1.address, feeXpcTracker.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXpcTracker.balanceOf(user1.address)).eq(expandDecimals(2991, 17))

    expect(await feeXpcTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeXpcTracker.depositBalances(user3.address, xpc.address)).eq(0)

    expect(await stakedXpcTracker.stakedAmounts(user3.address)).eq(0)
    expect(await stakedXpcTracker.depositBalances(user3.address, feeXpcTracker.address)).eq(0)
    expect(await stakedXpcTracker.balanceOf(user3.address)).eq(0)

    await xpcBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17))

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXpcTracker.depositBalances(user1.address, xpc.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXpcTracker.depositBalances(user1.address, feeXpcTracker.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXpcTracker.balanceOf(user1.address)).eq(0)

    expect(await feeXpcTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeXpcTracker.depositBalances(user3.address, xpc.address)).eq(0)

    expect(await stakedXpcTracker.stakedAmounts(user3.address)).eq(0)
    expect(await stakedXpcTracker.depositBalances(user3.address, feeXpcTracker.address)).eq(0)
    expect(await stakedXpcTracker.balanceOf(user3.address)).eq(expandDecimals(2991, 17))

    await expect(rewardRouter.connect(user1).unstakeAndRedeemXpc(
      bnb.address,
      expandDecimals(2991, 17),
      "0",
      user1.address
    )).to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await xpcBalance.connect(user3).approve(user2.address, expandDecimals(3000, 17))

    await expect(xpcBalance.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(2992, 17)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds balance")

    await xpcBalance.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(2991, 17))

    expect(await bnb.balanceOf(user1.address)).eq(0)

    await rewardRouter.connect(user1).unstakeAndRedeemXpc(
      bnb.address,
      expandDecimals(2991, 17),
      "0",
      user1.address
    )

    expect(await bnb.balanceOf(user1.address)).eq("994009000000000000")
  })
})
