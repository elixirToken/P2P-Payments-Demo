var TokenManager1 = artifacts.require('TokenManager1.sol');
var Elixir = artifacts.require('Elixir.sol');
var TokenP = artifacts.require('TokenP.sol');
var BigNumber = require('bignumber.js');
BigNumber.config({ROUNDING_MODE: BigNumber.ROUND_FLOOR})
contract('TokenManager1', function(accounts) {
let volAddress = 0x0000000000000000000000000000000000000000;
let elixToken;
let tokenManagerInstance;
let tokenPToken;
let borrower = accounts[0];
let lender = accounts[1];
let user1 = accounts[2];
let user2 = accounts[3];
let zeroBalUser = accounts[4];
let unapprovedUser = accounts[5];
let devAddress = accounts[7];
let amount = 100;
let length = 100;
let interest = 10;
let willMine = false;
let requestCancel = false;
let loanMessage = "Give me tokens";
let amountPaidBackSoFar = 0;
let rewardFactorBorrower=58566857;
let rewardFactorLender=31536000;
let maxLoanAmount = 10000000;
let maxInterestAmount = 10000;
let cappedLoanAmount = BigNumber(100000000000000000000000000000);
let cappedInterestAmount = BigNumber(100000000000000000000000000000);
let loanStatusKey = {REQUESTED_STATUS: 1, ACTIVE_STATUS: 2, MINING_STATUS: 3, REQUEST_CANCELED_BY_BORROWER_STATUS: 4, REQUEST_CANCELED_BY_LENDER_STATUS: 5, COMPLETION_STATUS: 6, ACTIVE_LOAN_CANCELED_BY_LENDER_STATUS: 7};
let loanArgKey = {borrower: 0, lender: 1, volAddress: 2, startBlock: 3, amount: 4, paidBackBlock: 5, status: 6, amountPaidBackSoFar: 7, loanLength: 8, interest: 9, willMine: 10, borrowerPaidLate: 11, requestCancel: 12, message: 13};
function fillRandomArray( desiredLength, min, max ){
let randomArray = [];
for( let i = 0; i < desiredLength; i++ ){
randomArray.push( Math.floor(Math.random()*max) + min );
}
return randomArray
}
// distribute tokens to users
function distributeTokens(users, importAmt){
return Promise.all(users.map(function (userObj){
let user = userObj.user;
return elixToken.importBalance(importAmt, {from: user}).then( function (data){
return elixToken.balanceOf(user)
})
}))
}
function distributeTokensToOneUser(user, importAmt){
return elixToken.importBalance(importAmt, {from: user}).then( function (data){
return elixToken.balanceOf(user)
})
}
function calculateMiningReward(startBlock, paidBackBlock, totalAmount, rewardFactor){
return Math.floor( ((paidBackBlock - startBlock) * totalAmount) / rewardFactor );
}
function standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine){
assert.equal(loanState[ loanArgKey['lender'] ], lender, 'lender check');
assert.equal(loanState[ loanArgKey['borrower'] ], borrower, 'borrower check');
assert.equal(loanState[ loanArgKey['amount'] ].toNumber(), amount, 'amount check');
assert.equal(loanState[ loanArgKey['interest'] ].toNumber(), interest, 'interest check');
assert.equal(loanState[ loanArgKey['amountPaidBackSoFar'] ].toNumber(), amountPaidBackSoFar, 'amountPaidBackSoFar check');
assert.equal(loanState[ loanArgKey['willMine'] ], willMine, 'willMine check');
}
function getElixBalancesOfBorrowerAndLender(borrower, lender){
let lenderBorrowerBalances = [elixToken.balanceOf(borrower), elixToken.balanceOf(lender)]
return Promise.all(lenderBorrowerBalances)
}
function getTokenPBalancesOfBorrowerAndLender(borrower, lender){
let lenderBorrowerBalances = [tokenPToken.balanceOf(borrower), tokenPToken.balanceOf(lender)]
return Promise.all(lenderBorrowerBalances)
}
function loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, maxApproval){
let loanIndex;
let startBlock;
let initialLenderBalance;
let initialLenderBalanceBigNumber;
let initialBorrowerBalance;
let initialBorrowerBalanceBigNumber;
let afterLoanBorrowerBalance;
let afterLoanBorrowerBalanceBigNumber;
let afterLoanLenderBalance;
let afterLoanLenderBalanceBigNumber;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber();
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return distributeTokensToOneUser(lender, amount);
}).then( function(userBalance){
initialLenderBalance = BigNumber(userBalance);
assert.isAtLeast(initialLenderBalance.toNumber(), amount);
return elixToken.balanceOf(borrower)
}).then( function (borrowerInitialBalance){
initialBorrowerBalance = BigNumber(borrowerInitialBalance);
if(maxApproval){
return elixToken.approve(tokenManagerInstance.address, (maxLoanAmount + maxInterestAmount), {from: lender});
}
else{
return elixToken.approve(tokenManagerInstance.address, amount, {from: lender});
}
}).then( function (ret){
assert.isOk(ret);
return tokenManagerInstance.attemptBeginLoanAtIndex(loanIndex, {from: lender});
}).then( function (ret){
startBlock = ret.receipt.blockNumber;
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should be changed to active after being accepted');
assert.equal(loanState[ loanArgKey['startBlock'] ].toNumber(), startBlock, 'start block should be assigned to block where loan accepted');
return elixToken.balanceOf(borrower)
}).then( function (afterLoanBorrowerBalance){
afterLoanBorrowerBalance = BigNumber(afterLoanBorrowerBalance);
assert.isTrue(afterLoanBorrowerBalance.isEqualTo(initialBorrowerBalance.plus(amount)));
return elixToken.balanceOf(lender)
}).then( function (afterLoanLenderBalance){
afterLoanLenderBalance = BigNumber(afterLoanLenderBalance);
assert.isTrue(afterLoanLenderBalance.isEqualTo(initialLenderBalance.minus(amount)))
return Promise.resolve({index: loanIndex, lenderBalance: afterLoanLenderBalance.toNumber(), startBlock: startBlock});
})
}
function initialLoanPaymentMade(loanIndex, borrower, lender, amount, interest, willMine, initialPayment){
let lenderBalance;
let borrowerBalance;
let amountPaidBackSoFar = 0;
let amountOwed = amount + interest;
return distributeTokensToOneUser(borrower, (amount + interest)).then( function(userBalance){
borrowerBalance = userBalance.toNumber();
assert.isAtLeast(borrowerBalance, amountOwed); 
return elixToken.approve(tokenManagerInstance.address, (amount+ interest), {from: borrower});
}).then( function (){
return elixToken.balanceOf(lender);
}).then( function (userBalance){
lenderBalance = userBalance.toNumber();
return tokenManagerInstance.payAmountForLoanAtIndex(initialPayment, loanIndex, {from: borrower});
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
amountPaidBackSoFar+=initialPayment;
return Promise.resolve({amountPaidBackSoFar: amountPaidBackSoFar, initialBorrowerBalance: borrowerBalance, initialLenderBalance: lenderBalance})
})
}
function loanPaidBack(index, borrower, lender, amount, interest, willMine){
let loanIndex = index;
let totalOwed = amount + interest;
let amountPaidBackSoFar = 0;
let borrowerBalance;
let paidBackBlock;
let contractBalance;
return distributeTokensToOneUser(borrower, totalOwed).then( function(userBalance){
borrowerBalance = userBalance.toNumber();
assert.isAtLeast(borrowerBalance, totalOwed); 
return elixToken.approve(tokenManagerInstance.address, totalOwed, {from: borrower});
}).then( function (){
return elixToken.balanceOf(tokenManagerInstance.address);
}).then( function (newContractBalance){
contractBalance = newContractBalance.toNumber();
}).then( function(){
return tokenManagerInstance.payAmountForLoanAtIndex(totalOwed, loanIndex, {from: borrower});
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object')
paidBackBlock = ret.receipt.blockNumber;
amountPaidBackSoFar += totalOwed
return elixToken.balanceOf(borrower);
}).then( function (afterLoanPaymentBorrowerBalance){
assert.equal(afterLoanPaymentBorrowerBalance.toNumber(), borrowerBalance - totalOwed)
return elixToken.balanceOf(tokenManagerInstance.address)
}).then( function (newContractBalance){
if( !willMine ){
assert.equal(contractBalance, newContractBalance.toNumber());
}
else{
assert.equal(newContractBalance.toNumber(), (contractBalance + totalOwed) )
}
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
if( !willMine ){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['COMPLETION_STATUS'], 'loan should be marked complete after paid back');
}
else{
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['MINING_STATUS'], 'loan should be moved to mining after being paid back');
}
assert.equal(loanState[ loanArgKey['paidBackBlock'] ].toNumber(), paidBackBlock);
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return Promise.resolve(loanState);
})	
}
before( function (){
return Elixir.deployed().then( function (instance){
elixToken = instance
return TokenManager1.deployed()
}).then( function (instance){
tokenManagerInstance = instance;
return tokenManagerInstance.setFakeElixAddress(elixToken.address);
}).then( function (){
return TokenP.deployed()
}).then( function (instance){
tokenPToken = instance
return tokenPToken.setTkm(tokenManagerInstance.address);
}).then( function (){
return tokenManagerInstance.setNewTokenAddress(tokenPToken.address);
}).then( function(){
return tokenPToken.setFakeDevAddress(devAddress);
}).then( function (instance){
return tokenManagerInstance.updateVolatilityAdjustmentStatus(1, {from: devAddress});
})
})
it("should allow volatility address to increase the amount and interest for loan", function (){
let loanIndex;
let volAddress = user2;
let newAmount = amount + 10;
let newInterest = interest + 5;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return tokenManagerInstance.adjustLoanParams(newAmount, newInterest, loanIndex, {from: volAddress});
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex);
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should be active');
standardLoanStateChecks(loanState, lender, borrower, newAmount, newInterest, amountPaidBackSoFar, willMine);
})
})
it("should not allow borrower (not volatility address) to increase the amount and interest for loan", function (){
let loanIndex;
let volAddress = user2;
let newAmount = amount + 10;
let newInterest = interest + 5;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return tokenManagerInstance.adjustLoanParams(newAmount, newInterest, loanIndex, {from: borrower});
}).then( function (ret){
assert.fail(ret);
}).catch( function (err){
assert.typeOf(err, 'error');
})
})
it("should not allow lender (not volatility address) to increase the amount and interest for loan", function (){
let loanIndex;
let volAddress = user2;
let newAmount = amount + 10;
let newInterest = interest + 5;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return tokenManagerInstance.adjustLoanParams(newAmount, newInterest, loanIndex, {from: lender});
}).then( function (ret){
assert.fail(ret);
}).catch( function (err){
assert.typeOf(err, 'error');
})
})
it("should allow volatility address to increase the amount and interest after payments made", function (){
let loanIndex;
let volAddress = user2;
let newAmount = amount + 20;
let newInterest = interest + 5;
let borrowerBalance;
let lenderBalance;
let amountPaidBackSoFar = 0;
let initialPayment = amount/5;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return initialLoanPaymentMade(loanIndex, borrower, lender, amount, interest, willMine, initialPayment); 
}).then( function (loanProperties){
borrowerBalance = loanProperties.initialBorrowerBalance;
lenderBalance = loanProperties.initialLenderBalance;
amountPaidBackSoFar = loanProperties.amountPaidBackSoFar;
return tokenManagerInstance.adjustLoanParams(newAmount, newInterest, loanIndex, {from: volAddress});
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex);
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should be active');
standardLoanStateChecks(loanState, lender, borrower, newAmount, newInterest, amountPaidBackSoFar, willMine);
})
})
it("should allow borrower to pay off new loan amount after volatility address adjusts loan (nonmining loan)", function (){
let loanIndex;
let volAddress = user2;
let newAmount = amount + 20;
let newInterest = interest + 5;
let borrowerBalance;
let lenderBalance;
let amountPaidBackSoFar = 0;
let initialPayment = amount/5;
let remainingAmount;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
// have to authorize borrower to pay back new amount
return initialLoanPaymentMade(loanIndex, borrower, lender, newAmount, newInterest, willMine, initialPayment); 
}).then( function (loanProperties){
borrowerBalance = loanProperties.initialBorrowerBalance;
lenderBalance = loanProperties.initialLenderBalance;
amountPaidBackSoFar = loanProperties.amountPaidBackSoFar;
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterLoanPaymentBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let afterLoanPaymentLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal( (borrowerBalance - initialPayment), afterLoanPaymentBorrowerBalance);
assert.equal( (lenderBalance + initialPayment), afterLoanPaymentLenderBalance);
borrowerBalance = afterLoanPaymentBorrowerBalance;
lenderBalance = afterLoanPaymentLenderBalance;
return tokenManagerInstance.adjustLoanParams(newAmount, newInterest, loanIndex, {from: volAddress});
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex);
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should be active');
standardLoanStateChecks(loanState, lender, borrower, newAmount, newInterest, amountPaidBackSoFar, willMine);
remainingAmount = (newAmount+newInterest) - amountPaidBackSoFar;
return tokenManagerInstance.payAmountForLoanAtIndex(remainingAmount, loanIndex, {from: borrower});
}).then( function (){
amountPaidBackSoFar += remainingAmount;
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['COMPLETION_STATUS'], 'loan should be completed');
standardLoanStateChecks(loanState, lender, borrower, newAmount, newInterest, amountPaidBackSoFar, willMine);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterLoanPaymentBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let afterLoanPaymentLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal( (borrowerBalance - remainingAmount), afterLoanPaymentBorrowerBalance);
assert.equal( (lenderBalance + remainingAmount), afterLoanPaymentLenderBalance);
})
})
it("should allow borrower to pay off new loan amount after volatility address adjusts loan (mining loan)", function (){
let loanIndex;
let volAddress = user2;
let newAmount = amount + 20;
let newInterest = interest + 5;
let borrowerBalance;
let lenderBalance;
let amountPaidBackSoFar = 0;
let initialPayment = amount/5;
let remainingAmount;
let willMine = true;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
// have to authorize borrower to pay back new amount
return initialLoanPaymentMade(loanIndex, borrower, lender, newAmount, newInterest, willMine, initialPayment); 
}).then( function (loanProperties){
borrowerBalance = loanProperties.initialBorrowerBalance;
lenderBalance = loanProperties.initialLenderBalance;
amountPaidBackSoFar = loanProperties.amountPaidBackSoFar;
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterLoanPaymentBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let afterLoanPaymentLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal( (borrowerBalance - initialPayment), afterLoanPaymentBorrowerBalance);
assert.equal( lenderBalance, afterLoanPaymentLenderBalance);
borrowerBalance = afterLoanPaymentBorrowerBalance;
lenderBalance = afterLoanPaymentLenderBalance;
return tokenManagerInstance.adjustLoanParams(newAmount, newInterest, loanIndex, {from: volAddress});
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex);
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should be active');
standardLoanStateChecks(loanState, lender, borrower, newAmount, newInterest, amountPaidBackSoFar, willMine);
remainingAmount = (newAmount+newInterest) - amountPaidBackSoFar;
return tokenManagerInstance.payAmountForLoanAtIndex(remainingAmount, loanIndex, {from: borrower});
}).then( function (){
amountPaidBackSoFar += remainingAmount;
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['MINING_STATUS'], 'loan should be completed');
standardLoanStateChecks(loanState, lender, borrower, newAmount, newInterest, amountPaidBackSoFar, willMine);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterLoanPaymentBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let afterLoanPaymentLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal( (borrowerBalance - remainingAmount), afterLoanPaymentBorrowerBalance);
assert.equal( lenderBalance, afterLoanPaymentLenderBalance);
})
})
it("should allow volatility address to change amount and interest randomly and loan should be marked completed if already paid back and amount and interest are adjusted accordingly (nonmining)", function (){
function adjustLoanParamsAndPay(initialPayment, initialAmount, initialInterest, newAmount, newInterest){
let loanIndex;
let volAddress = user2;
let borrowerBalance;
let lenderBalance;
let initialBorrowerBalance;
let initialLenderBalance;
let amountPaidBackSoFar = 0;
let remainingAmount = 0;
let amount = initialAmount;
let interest = initialInterest;
let maxApproval = true;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, maxApproval).then( function(loanProperties){
loanIndex = loanProperties.index;
return initialLoanPaymentMade(loanIndex, borrower, lender, amount, interest, willMine, initialPayment); 
}).then( function (loanProperties){
initialBorrowerBalance = loanProperties.initialBorrowerBalance;
initialLenderBalance = loanProperties.initialLenderBalance;
amountPaidBackSoFar = loanProperties.amountPaidBackSoFar;
borrowerBalance = initialBorrowerBalance;
lenderBalance = initialLenderBalance;
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterLoanPaymentBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let afterLoanPaymentLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal( (borrowerBalance - initialPayment), afterLoanPaymentBorrowerBalance);
assert.equal( (lenderBalance + initialPayment), afterLoanPaymentLenderBalance);
borrowerBalance = afterLoanPaymentBorrowerBalance;
lenderBalance = afterLoanPaymentLenderBalance;
return tokenManagerInstance.adjustLoanParams(newAmount, newInterest, loanIndex, {from: volAddress});
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex);
}).then( function(loanState){
let adjustedInterest;
let adjustedAmt;
if( (newAmount + newInterest) > amountPaidBackSoFar){
adjustedInterest = newInterest
adjustedAmt = newAmount
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should still be active');
}
else{
let interestAmtRatio = newInterest/(newAmount+newInterest);
adjustedInterest = Math.floor(amountPaidBackSoFar*interestAmtRatio);
adjustedAmt = amountPaidBackSoFar - adjustedInterest;
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['COMPLETION_STATUS'], 'loan should now be complete');
assert.equal(adjustedAmt+adjustedInterest, amountPaidBackSoFar);
}
standardLoanStateChecks(loanState, lender, borrower, adjustedAmt, adjustedInterest, amountPaidBackSoFar, willMine);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
// lender and borrower already paid everything, balances shouldnt change since last loan payment
let afterAdjustmentBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let afterAdjustmentLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal(borrowerBalance, afterAdjustmentBorrowerBalance);
assert.equal(lenderBalance, afterAdjustmentLenderBalance);
assert.equal((initialBorrowerBalance - amountPaidBackSoFar), afterAdjustmentBorrowerBalance);
assert.equal((initialLenderBalance + amountPaidBackSoFar), afterAdjustmentLenderBalance);
})
}
let initialAmounts = fillRandomArray(10, 2, maxLoanAmount);
let initialInterests = fillRandomArray(10, 0, maxInterestAmount);
let newAmounts = fillRandomArray(10, 1, maxLoanAmount);
let newInterests = fillRandomArray(10, 0, maxInterestAmount);
let numArr = [];
for(var i = 0; i < 10; i++){
numArr.push(i);
}
// run them synchronously so chain not interrupted because using same users (approve would overwrite etc)
return numArr.reduce(function (chain, index){
let initialAmount = initialAmounts[index];
let initialInterest = initialInterests[index];
let newAmount = newAmounts[index];
let newInterest = newInterests[index];
let initialPayment = initialAmount - Math.floor( Math.random()*((initialAmount-1) + 1 ) );
return chain.then(function (){
return adjustLoanParamsAndPay(initialPayment, initialAmount, initialInterest, newAmount, newInterest)
} );
}, Promise.resolve())
})
it("should allow borrower to pay off new loan amount after volatility address adjusts loan to edge maximum amount and interest using bignumber (nonmining loan)", function (){
let loanIndex;
// smallest user payment is .0001 * 10^18
let amount = 500000000000000;
let volAddress = user2;
let newAmount = cappedLoanAmount;
let newInterest = cappedInterestAmount;
let borrowerBalance;
let lenderBalance;
let amountPaidBackSoFar = BigNumber(0);
let initialPayment = amount/5;
let remainingAmount;
let amountOwed = amount + interest;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
// have to authorize borrower to pay back new amount  	
return distributeTokensToOneUser(borrower, (newAmount.plus(newInterest).toNumber()))
}).then( function(userBalance){
borrowerBalance = userBalance;
assert.isAtLeast(borrowerBalance.toNumber(), amountOwed); 
return elixToken.approve(tokenManagerInstance.address, (newAmount.plus(newInterest)).toNumber(), {from: borrower});
}).then( function (){
return elixToken.balanceOf(lender);
}).then( function (userBalance){
lenderBalance = userBalance;
return tokenManagerInstance.payAmountForLoanAtIndex(initialPayment, loanIndex, {from: borrower});
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
amountPaidBackSoFar=amountPaidBackSoFar.plus(initialPayment);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterLoanPaymentBorrowerBalance = borrowerAndLenderBalances[0];
let afterLoanPaymentLenderBalance = borrowerAndLenderBalances[1];
assert.equal( (borrowerBalance.minus(initialPayment).toNumber()), afterLoanPaymentBorrowerBalance.toNumber());
assert.equal( (lenderBalance.plus(initialPayment).toNumber()), afterLoanPaymentLenderBalance.toNumber());
borrowerBalance = afterLoanPaymentBorrowerBalance;
lenderBalance = afterLoanPaymentLenderBalance;
return tokenManagerInstance.adjustLoanParams(newAmount.toNumber(), newInterest.toNumber(), loanIndex, {from: volAddress});
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex);
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should be active');
standardLoanStateChecks(loanState, lender, borrower, newAmount.toNumber(), newInterest.toNumber(), amountPaidBackSoFar.toNumber(), willMine);
remainingAmount = newAmount.plus(newInterest).minus(amountPaidBackSoFar);
return tokenManagerInstance.payAmountForLoanAtIndex(remainingAmount.toNumber(), loanIndex, {from: borrower});
}).then( function (){
amountPaidBackSoFar=amountPaidBackSoFar.plus(remainingAmount);
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['COMPLETION_STATUS'], 'loan should be completed');
standardLoanStateChecks(loanState, lender, borrower, newAmount.toNumber(), newInterest.toNumber(), amountPaidBackSoFar, willMine);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterLoanPaymentBorrowerBalance = borrowerAndLenderBalances[0];
let afterLoanPaymentLenderBalance = borrowerAndLenderBalances[1];
assert.equal( borrowerBalance.minus(remainingAmount).toNumber(), afterLoanPaymentBorrowerBalance.toNumber());
assert.equal( lenderBalance.plus(remainingAmount).toNumber(), afterLoanPaymentLenderBalance.toNumber());
})
})
})