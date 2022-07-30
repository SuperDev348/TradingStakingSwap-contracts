const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  const opec = { address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a" }
  const wOpec = { address: "0x590020B1005b8b25f1a2C82c5f743c540dcfa24d" }
  await deployContract("Bridge", [opec.address, wOpec.address], "Bridge")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
