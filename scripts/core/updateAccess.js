const { contractAt, sendTxn } = require("../shared/helpers")

const wallet = { address: "0x937B52690883994B0549b6a3093356b83a1F59a0" }
const timelock = { address: "0x59c46156ED614164eC66A3CFa5822797f533c902" }

async function printRewardTracker(rewardTracker, label) {
  // console.log(label, "inPrivateTransferMode", await rewardTracker.inPrivateTransferMode())
  // console.log(label, "inPrivateStakingMode", await rewardTracker.inPrivateStakingMode())
  // console.log(label, "inPrivateClaimingMode", await rewardTracker.inPrivateClaimingMode())
  console.log(label, "isHandler", await rewardTracker.isHandler(wallet.address))
  console.log(label, "gov", await rewardTracker.gov())
}

async function updateHandler(rewardTracker, label) {
  await sendTxn(rewardTracker.setHandler(wallet.address, false), `${label}, rewardTracker.setHandler`)
}

async function printToken(token, label) {
  console.log(label, "inPrivateTransferMode", await token.inPrivateTransferMode())
  console.log(label, "isHandler", await token.isHandler(wallet.address))
  console.log(label, "isMinter", await token.isMinter(wallet.address))
  console.log(label, "gov", await token.gov())
}

async function printUsdg(token, label) {
  console.log(label, "isVault", await token.vaults(wallet.address))
  console.log(label, "gov", await token.gov())
}

async function updateToken(token, label) {
  // await sendTxn(token.removeAdmin(wallet.address), `${label}, token.removeAdmin`)
  await sendTxn(token.setMinter(wallet.address, false), `${label}, token.setMinter`)
}

async function updateGov(contract, label) {
  await sendTxn(contract.setGov(timelock.address), `${label}.setGov`)
}

async function signalGov(prevGov, contract, nextGov, label) {
  await sendTxn(prevGov.signalSetGov(contract.address, nextGov.address), `${label}.signalSetGov`)
}

async function updateRewardTrackerGov(rewardTracker, label) {
  const distributorAddress = await rewardTracker.distributor()
  const distributor = await contractAt("RewardDistributor", distributorAddress)
  await sendTxn(rewardTracker.setGov(timelock.address), `${label}.setGov`)
  await sendTxn(distributor.setGov(timelock.address), `${label}.distributor.setGov`)
}

async function main() {
  const stakedOpecTracker = await contractAt("RewardTracker", "0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342")
  const bonusOpecTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const feeOpecTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")

  const stakedXpcTracker = await contractAt("RewardTracker", "0x9e295B5B976a184B14aD8cd72413aD846C299660")
  const feeXpcTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  await printRewardTracker(stakedOpecTracker, "stakedOpecTracker")
  await printRewardTracker(bonusOpecTracker, "bonusOpecTracker")
  await printRewardTracker(feeOpecTracker, "feeOpecTracker")

  await printRewardTracker(stakedXpcTracker, "stakedXpcTracker")
  await printRewardTracker(feeXpcTracker, "feeXpcTracker")

  const xpc = await contractAt("MintableBaseToken", "0x01234181085565ed162a948b6a5e88758CD7c7b8")
  const usdg = await contractAt("USDG", "0x8b6AD321b1d4BCE9F25d0Ac092c3C1144c777C93")
  // const opec = await contractAt("MintableBaseToken", "0x62edc0692BD897D2295872a9FFCac5425011c661")
  // const esOpec = await contractAt("MintableBaseToken", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17")
  const bnOpec = await contractAt("MintableBaseToken", "0x8087a341D32D445d9aC8aCc9c14F5781E04A26d2")

  await printToken(xpc, "xpc")
  await printUsdg(usdg, "usdg")
  // await printToken(opec, "opec")
  // await printToken(esOpec, "esOpec")
  await printToken(bnOpec, "bnOpec")

  // const prevGov = await contractAt("Timelock", "0x4a3930b629f899fe19c1f280c73a376382d61a78")
  // const nextGov = await contractAt("Timelock", "0x09214C0A3594fbcad59A58099b0A63E2B29b15B8")

  // await signalGov(prevGov, xpc, nextGov, "xpc")
  // await signalGov(prevGov, opec, nextGov, "opec")
  // await signalGov(prevGov, esOpec, nextGov, "esOpec")
  // await signalGov(prevGov, bnOpec, nextGov, "bnOpec")

  await updateToken(opec, "opec")
  await updateToken(esOpec, "esOpec")
  await updateToken(bnOpec, "bnOpec")

  await updateHandler(stakedOpecTracker, "stakedOpecTracker")
  await updateHandler(bonusOpecTracker, "bonusOpecTracker")
  await updateHandler(feeOpecTracker, "feeOpecTracker")
  await updateHandler(stakedXpcTracker, "stakedXpcTracker")
  await updateHandler(feeXpcTracker, "feeXpcTracker")

  await updateRewardTrackerGov(stakedOpecTracker, "stakedOpecTracker")

  await updateRewardTrackerGov(bonusOpecTracker, "bonusOpecTracker")
  await updateRewardTrackerGov(feeOpecTracker, "feeOpecTracker")
  await updateRewardTrackerGov(stakedXpcTracker, "stakedXpcTracker")
  await updateRewardTrackerGov(feeXpcTracker, "feeXpcTracker")

  await updateGov(xpc, "xpc")
  await updateGov(usdg, "usdg")
  // await updateGov(opec, "opec")
  // await updateGov(esOpec, "esOpec")
  await updateGov(bnOpec, "bnOpec")

  const vault = await contractAt("Vault", "0x050C08cdeEc2e081Eb0Bf5181AAA4D8FfC18A38f")
  const vaultPriceFeedAddress = await vault.priceFeed()
  const vaultPriceFeed = await contractAt("VaultPriceFeed", vaultPriceFeedAddress)
  const xpcManager = await contractAt("XpcManager", "0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F")
  const router = await contractAt("Router", "0x6d2FCB937472CB4c471ec79711f998984361C0ab")

  await updateGov(vault, "vault")
  await updateGov(vaultPriceFeed, "vaultPriceFeed")
  await updateGov(xpcManager, "xpcManager")
  await updateGov(router, "router")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
