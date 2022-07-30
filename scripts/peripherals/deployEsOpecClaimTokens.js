const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  await deployContract("MintableBaseToken", ["VestingOption", "ARB:OPEC", 0])
  await deployContract("MintableBaseToken", ["VestingOption", "ARB:XPC", 0])
  await deployContract("MintableBaseToken", ["VestingOption", "AVAX:OPEC", 0])
  await deployContract("MintableBaseToken", ["VestingOption", "AVAX:XPC", 0])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
