const { getFrameSigner, deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")

  const addresses = [
    ["vault", vault.address],
    ["xpcManager", "0x321F653eED006AD1C29D174e17d96351BDe22649"],
    ["xpc", "0xDE7A1DC9a73f22F9B628636539E2b8d2FE866069"],
    ["opec", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a"],
    ["esOpec", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA"],
    ["bnOpec", "0x35247165119B69A40edD5304969560D0ef486921"],
    ["usdg", "0x8b6AD321b1d4BCE9F25d0Ac092c3C1144c777C93"],
    ["opecVester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004"],
    ["xpcVester", "0xA75287d2f8b217273E7FCD7E86eF07D33972042E"],
  ]

  const trackers = [
    ["stakedOpecTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4"],
    ["bonusOpecTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13"],
    ["feeOpecTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F"],
    ["feeXpcTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6"],
    ["stakedXpcTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903"],
  ]

  return { vault, addresses, trackers }
}

async function getAvaxValues() {
  const vault = await contractAt("Vault", "0x050C08cdeEc2e081Eb0Bf5181AAA4D8FfC18A38f")

  const addresses = [
    ["vault", vault.address],
    ["xpcManager", "0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F"],
    ["xpc", "0x01234181085565ed162a948b6a5e88758CD7c7b8"],
    ["opec", "0x62edc0692BD897D2295872a9FFCac5425011c661"],
    ["esOpec", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17"],
    ["bnOpec", "0x8087a341D32D445d9aC8aCc9c14F5781E04A26d2"],
    ["usdg", "0x8b6AD321b1d4BCE9F25d0Ac092c3C1144c777C93"],
    ["opecVester", "0x472361d3cA5F49c8E633FB50385BfaD1e018b445"],
    ["xpcVester", "0x62331A7Bd1dfB3A7642B7db50B5509E57CA3154A"],
  ]

  const trackers = [
    ["stakedOpecTracker", "0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342"],
    ["bonusOpecTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4"],
    ["feeOpecTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13"],
    ["feeXpcTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F"],
    ["stakedXpcTracker", "0x9e295B5B976a184B14aD8cd72413aD846C299660"],
  ]

  return { vault, addresses, trackers }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  // const signer = await getFrameSigner()

  const { vault, addresses, trackers } = await getValues()

  const distributors = []

  for (let i = 0; i < trackers.length; i++) {
    const [label, trackerAddress] = trackers[i]
    const tracker = await contractAt("RewardTracker", trackerAddress)
    distributors.push([`${label}.distributor`, await tracker.distributor()])
  }

  const priceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())
  const secondaryPriceFeed = await contractAt("FastPriceFeed", await priceFeed.secondaryPriceFeed())

  const contracts = addresses.concat(trackers).concat(distributors).concat([
    ["priceFeed", priceFeed.address],
    ["secondaryPriceFeed", secondaryPriceFeed.address]
  ])

  for (let i = 0; i < contracts.length; i++) {
    const [label, address] = contracts[i]
    const goverable = await contractAt("Governable", address)
    const timelock = await contractAt("Timelock", await goverable.gov())
    const admin = await timelock.admin()
    console.log(`${label}, ${address}:\n${timelock.address}, ${admin}\n`)
  }

  // const prevGov = await contractAt("Timelock", "0x181e9495444cc7AdCE9fBdeaE4c66D7c4eFEeaf5", signer)
  // const nextGov = { address: "0x3F3E77421E30271568eF7A0ab5c5F2667675341e" }
  // for (let i = 0; i < addresses.length; i++) {
  //   const address = addresses[i]
  //   await sendTxn(prevGov.signalSetGov(address, nextGov.address), `${i}: signalSetGov`)
  //   // await sendTxn(prevGov.setGov(address, nextGov.address), `${i}: setGov`)
  // }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
