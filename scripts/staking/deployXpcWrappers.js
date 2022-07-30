const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const xpc = { address: "0xDE7A1DC9a73f22F9B628636539E2b8d2FE866069" }
  const xpcManager = { address: "0x321F653eED006AD1C29D174e17d96351BDe22649" }
  const stakedXpcTracker = { address: "0x1aDDD80E6039594eE970E5872D247bf0414C8903" }
  const feeXpcTracker = { address: "0x4e971a87900b931fF39d1Aad67697F49835400b6" }

  return { xpc, xpcManager, stakedXpcTracker, feeXpcTracker }
}

async function getAvaxValues() {
  const xpc = { address: "0x01234181085565ed162a948b6a5e88758CD7c7b8" }
  const xpcManager = { address: "0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F" }
  const stakedXpcTracker = { address: "0x9e295B5B976a184B14aD8cd72413aD846C299660" }
  const feeXpcTracker = { address: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F" }

  return { xpc, xpcManager, stakedXpcTracker, feeXpcTracker }
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
  const { xpc, xpcManager, stakedXpcTracker, feeXpcTracker } = await getValues()

  await deployContract("StakedXpc", [
    xpc.address,
    xpcManager.address,
    stakedXpcTracker.address,
    feeXpcTracker.address
  ])

  // await deployContract("XpcBalance", [xpcManager.address, stakedXpcTracker.address])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
