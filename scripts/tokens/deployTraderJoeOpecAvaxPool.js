const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")
import "../../contracts/token/TraderJoeOpecAvaxPool.sol";
async function main() {
  await deployContract("TraderJoeOpecAvaxPool", [])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
