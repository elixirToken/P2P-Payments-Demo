var TokenManager1 = artifacts.require('TokenManager1.sol');
var Elixir = artifacts.require('Elixir.sol');
var TokenP = artifacts.require('TokenP.sol');
var BigNumber = require('bignumber.js');
BigNumber.config({ROUNDING_MODE: BigNumber.ROUND_FLOOR})
let currEthPrice = 845;
let gasPriceGwei = 20;
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
let user3 = accounts[6];
let amount = 100;
let length = 100;
let interest = 10;
let willMine = false;
let requestCancel = false;
let loanMessage = "Give me tokens";
let amountPaidBackSoFar = 0;
let rewardFactorBorrower=7884000;
let rewardFactorLender=14641714;
let fakeDevAddress = 0x85196Da9269B24bDf5FfD2624ABB387fcA05382B;
let cappedLoanAmount = BigNumber(100000000000000000000000000000);
let cappedInterestAmount = BigNumber(100000000000000000000000000000);
let loanStatusKey = {REQUESTED_STATUS: 1, ACTIVE_STATUS: 2, MINING_STATUS: 3, REQUEST_CANCELED_BY_BORROWER_STATUS: 4, REQUEST_CANCELED_BY_LENDER_STATUS: 5, COMPLETION_STATUS: 6, ACTIVE_LOAN_CANCELED_BY_LENDER_STATUS: 7, ACTIVE_LOAN_REQUEST_CANCEL_BY_LENDER_STATUS: 8};
let loanArgKey = {borrower: 0, lender: 1, volAddress: 2, startBlock: 3, amount: 4, paidBackBlock: 5, status: 6, amountPaidBackSoFar: 7, loanLength: 8, interest: 9, willMine: 10, borrowerPaidLate: 11, requestCancel: 12, message: 13};
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
function loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage){
let loanIndex;
let startBlock;
let initialLenderBalance;
let initialBorrowerBalance;
let afterLoanBorrowerBalance;
let afterLoanLenderBalance;
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
initialLenderBalance = userBalance.toNumber();
assert.isAtLeast(initialLenderBalance, amount);
return elixToken.balanceOf(borrower)
}).then( function (borrowerInitialBalance){
initialBorrowerBalance = borrowerInitialBalance.toNumber();
return elixToken.approve(tokenManagerInstance.address, amount, {from: lender});
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
afterLoanBorrowerBalance = afterLoanBorrowerBalance;
assert.equal(afterLoanBorrowerBalance.toNumber(), initialBorrowerBalance + amount);
return elixToken.balanceOf(lender)
}).then( function (afterLoanLenderBalance){
afterLoanLenderBalance = afterLoanLenderBalance;
assert.equal(afterLoanLenderBalance.toNumber(), initialLenderBalance - amount);
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
function awaitBlock(startBlock, paidBackBlock, loanIndex, actionForLoan, actionFrom, failCheck, successCheck){
let currentBlock;
function getUntil(){
return actionForLoan(loanIndex, {from: actionFrom}).then( function(result){
currentBlock = result.receipt.blockNumber
if(((currentBlock - paidBackBlock) < ((paidBackBlock - startBlock)))){
return tokenManagerInstance.loans.call(loanIndex).then( function (loanState){
failCheck(loanState);
return getUntil()
})
}
else{
return tokenManagerInstance.loans.call(loanIndex).then( function (loanState){
successCheck(loanState);
})
}
})
}
return getUntil();
}
function awaitBlockDuration(startBlock, length, loanIndex, actionForLoan, actionFrom, failCheck, successCheck){
let currentBlock;
function getUntil(){
return actionForLoan(loanIndex, {from: actionFrom}).then( function(result){
currentBlock = result.receipt.blockNumber
if( (currentBlock - startBlock) <= length){
return tokenManagerInstance.loans.call(loanIndex).then( function (loanState){
failCheck(loanState);
return getUntil()
})
}
else{
return tokenManagerInstance.loans.call(loanIndex).then( function (loanState){
successCheck(loanState);
})
}
})
}
return getUntil();
}
before( function (){
return Elixir.deployed().then( function (instance){
elixToken = instance
return TokenManager1.deployed()
}).then( function (instance){
tokenManagerInstance = instance;
return tokenManagerInstance.setFakeElixAddress(elixToken.address);
}).then( function(){
return TokenP.deployed()
}).then( function (instance){
tokenPToken = instance
return tokenPToken.setTkm(tokenManagerInstance.address);
}).then( function (){
return tokenManagerInstance.setNewTokenAddress(tokenPToken.address)
})
})
it("should allow borrower to request another loan", function() {
let loanIndex = 0;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber()
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
})
});
it("should allow another borrower to request loan", function() {
let loanIndex = 0;
let borrower = user2;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber()
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
})
});
it("should allow another borrower to request loan for slightly under max amount using bignumber", function() {
let loanIndex = 0;
let borrower = user2;
// user input precision to 4 decimals
let amount = cappedLoanAmount.minus(100000000000000);
return tokenManagerInstance.requestLoan(lender, volAddress, amount.toNumber(), length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber()
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
assert.equal(loanState[ loanArgKey['lender'] ], lender, 'lender check');
assert.equal(loanState[ loanArgKey['borrower'] ], borrower, 'borrower check');
assert.isTrue(amount.isEqualTo(loanState[ loanArgKey['amount'] ]));
assert.equal(amount.toNumber(), loanState[ loanArgKey['amount'] ].toNumber());
assert.equal(loanState[ loanArgKey['interest'] ].toNumber(), interest, 'interest check');
assert.equal(loanState[ loanArgKey['amountPaidBackSoFar'] ].toNumber(), amountPaidBackSoFar, 'amountPaidBackSoFar check');
assert.equal(loanState[ loanArgKey['willMine'] ], willMine, 'willMine check');
})
});
it("should allow another borrower to request second loan", function() {
let loanIndex = 0;
let borrower = user2;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber()
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
})
});
it("should allow borrower to request loan", function() {
let loanIndex = 0;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber()
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
})
});
it("should allow borrower to request loan with high amount", function() {
let loanIndex = 0;
let amount = 30000000;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber()
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
})
});
it("should allow borrower to request loan without message", function() {
let loanMessage = "";
let loanIndex = 0;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber()
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
})
});
it("should allow borrower to request loan with long loan message (msgX10)", function() {
let loanMessage = "Give me tokensGive me tokensGive me tokensGive me tokensGive me tokensGive me tokensGive me tokensGive me tokensGive me tokensGive me tokens";
let loanIndex = 0;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber()
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
})
});
it("should not allow borrower to make payments on unapproved loan", function() {
let loanIndex = 0;
let borrowerBalance;
let totalOwed = amount + interest;
let initialPayment = Math.floor(amount/5);
return distributeTokensToOneUser(borrower, totalOwed).then( function (userBalance){
borrowerBalance = userBalance.toNumber();
assert.isAtLeast(borrowerBalance, totalOwed);
return elixToken.approve(tokenManagerInstance.address, totalOwed, {from: borrower});
}).then( function (){
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower});
}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber()
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
return tokenManagerInstance.payAmountForLoanAtIndex(initialPayment, loanIndex, {from: borrower})
}).then( function(ret){
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should still be requested');
return elixToken.balanceOf(borrower);
}).then( function(userBalance){
// borrower balance should not have changed
assert.equal(borrowerBalance, userBalance.toNumber());
})
});
it("should not allow lender with no funds to accept loan", function() {
let loanIndex = 0;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber()
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return tokenManagerInstance.attemptBeginLoanAtIndex(loanIndex, {from: lender})
}).then( function (ret){
assert.fail(ret);
}).catch( function (err){
assert.typeOf(err, 'error');
})
});
it("should not allow lender who has not approved contract to accept loan", function (){
let loanIndex = 0;
let lenderBalance;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber()
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return distributeTokensToOneUser(lender, amount);
}).then( function(userBalance){
lenderBalance = userBalance.toNumber();
assert.isAtLeast(lenderBalance, amount);
return tokenManagerInstance.attemptBeginLoanAtIndex(loanIndex, {from: lender});
}).then( function (ret){
assert.fail(ret)
}).catch( function(err){
assert.typeOf(err, 'error');
})
})
it("should not allow user other than lender to accept loan", function (){
let loanIndex = 0;
let userBalance;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
loanIndex = ret.logs[0].args.index.toNumber()
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return distributeTokensToOneUser(user1, amount);
}).then( function(userBalance){
userBalance = userBalance.toNumber();
assert.isAtLeast(userBalance, amount);
return elixToken.approve(tokenManagerInstance.address, amount, {from: user1});
}).then( function (blah){
return tokenManagerInstance.attemptBeginLoanAtIndex(loanIndex, {from: user1});
}).then( function (ret){
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
})
})
it("should allow lender with sufficient approved funds to accept loan", function (){
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage);
})
it("should not allow borrower without funds to make payments to loan", function (){
let loanIndex;
let loanPayment = amount/5;
let borrower = zeroBalUser;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function(loanProperties){
loanIndex = loanProperties.index;
return tokenManagerInstance.payAmountForLoanAtIndex(loanPayment, loanIndex, {from: borrower});
}).then( function (ret){
assert.fail(ret);
}).catch( function (err){
assert.typeOf(err, 'error');
})
})
it("should not allow borrower with funds but without approving contract to make payments to loan", function (){
let loanIndex;
let loanPayment = amount/5;
let borrower = unapprovedUser;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function(loanProperties){
loanIndex = loanProperties.index;
return distributeTokensToOneUser(borrower, loanPayment);
}).then( function(userBalance){
userBalance = userBalance.toNumber();
assert.isAtLeast(userBalance, loanPayment);
return tokenManagerInstance.payAmountForLoanAtIndex(loanPayment, loanIndex, {from: borrower});
}).then( function (ret){
assert.fail(ret);
}).catch( function (err){
assert.typeOf(err, 'error');
})
})
it("should allow borrower with approved funds to make payments to loan", function (){
let loanIndex;
let loanPayment = amount/5;
let amountPaidBackSoFar = 0;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return distributeTokensToOneUser(borrower, loanPayment);
}).then( function(userBalance){
userBalance = userBalance.toNumber();
assert.isAtLeast(userBalance, loanPayment); 
return elixToken.approve(tokenManagerInstance.address, loanPayment, {from: borrower});
}).then( function(){
return tokenManagerInstance.payAmountForLoanAtIndex(loanPayment, loanIndex, {from: borrower});
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object')
amountPaidBackSoFar += loanPayment
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should be changed to active after being accepted');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
})	
})
it("loan stress test - should allow different borrowers to create many loans", function (){
let manyLoanArr = [];
function requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, loanBorrower){
let amountPaidBackSoFar = 0;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: loanBorrower}).then( function (ret){
})
}
let borrowerArr = [borrower, user1, user2, user3];
for( let i = 0; i < 100; i++){
let loanBorrower = borrowerArr[Math.floor(Math.random()*4)]
manyLoanArr.push(requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, loanBorrower));
}
return Promise.all(manyLoanArr);
})
it("should allow borrower with approved funds to pay back loan all at once without mining", function (){
let loanIndex;
let loanPayment = amount + interest;
let amountPaidBackSoFar = 0;
let startBlock = 0;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return loanPaidBack(loanIndex, borrower, lender, amount, interest, willMine);
})
})
it("should allow borrower with approved funds to pay back loan all at once without mining with high amount", function (){
let loanIndex;
let amount = 30000000;
let loanPayment = amount + interest;
let amountPaidBackSoFar = 0;
let startBlock = 0;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return loanPaidBack(loanIndex, borrower, lender, amount, interest, willMine);
})
})
it("should allow borrower with approved funds to pay back loan all at once with mining with high amount", function (){
let loanIndex;
let amount = 30000000;
let loanPayment = amount + interest;
let amountPaidBackSoFar = 0;
let startBlock = 0;
let willMine = true;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return loanPaidBack(loanIndex, borrower, lender, amount, interest, willMine);
})
})
it("should allow borrower with approved funds to pay back loan in full in multiple installments without mining", function (){
let loanIndex;
let numberInstallments = 10;
let loanPayment = (amount + interest)/numberInstallments;
let amountPaidBackSoFar = 0;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return distributeTokensToOneUser(borrower, (amount + interest));
}).then( function(userBalance){
userBalance = userBalance.toNumber();
assert.isAtLeast(userBalance, loanPayment); 
return elixToken.approve(tokenManagerInstance.address, (amount+ interest), {from: borrower});
}).then( function(){
let paymentsArray = [];
for(let i = 0; i < numberInstallments; i++){
paymentsArray.push( tokenManagerInstance.payAmountForLoanAtIndex(loanPayment, loanIndex, {from: borrower}) );
amountPaidBackSoFar+=loanPayment;
}
return Promise.all(paymentsArray);
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'array');
assert.isOk(ret[0]);
assert.typeOf(ret[0], 'object');
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['COMPLETION_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
})	
})
it("should allow borrower with approved funds to pay back loan all at once with mining", function (){
let loanIndex;
let willMine = true;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return loanPaidBack(loanIndex, borrower, lender, amount, interest, willMine);
})
})
it("after loan without mining paid back, lender should have amount and interest paid into their account", function (){
let loanIndex;
let lenderBalance;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
lenderBalance = loanProperties.lenderBalance;
return loanPaidBack(loanIndex, borrower, lender, amount, interest, willMine);
}).then( function (){
return elixToken.balanceOf(lender)
}).then( function (afterLoanLenderBalance){
assert.equal(afterLoanLenderBalance.toNumber(), lenderBalance + amount + interest);
})
})
it("for nonmining loans, incremental payments should be sent to lender as borrower makes them", function (){
let loanIndex;
let initialPayment = 10;
let amountOwed = amount + interest;
let amountPaidBackSoFar = 0;
let lenderBalance;
let borrowerBalance;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return initialLoanPaymentMade(loanIndex, borrower, lender, amount, interest, willMine, initialPayment);
}).then( function (loanProperties){
borrowerBalance = loanProperties.initialBorrowerBalance;
lenderBalance = loanProperties.initialLenderBalance;
amountPaidBackSoFar = loanProperties.amountPaidBackSoFar;
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then(function(lenderBorrowerBalances){
let afterLoanBorrowerBalance = lenderBorrowerBalances[0].toNumber();
let afterLoanLenderBalance = lenderBorrowerBalances[1].toNumber();
assert.equal(afterLoanBorrowerBalance, borrowerBalance - initialPayment);
assert.equal(afterLoanLenderBalance, lenderBalance + initialPayment);
borrowerBalance = afterLoanBorrowerBalance;
lenderBalance = afterLoanLenderBalance;
return tokenManagerInstance.payAmountForLoanAtIndex((amountOwed - initialPayment), loanIndex, {from: borrower});
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
amountPaidBackSoFar+= (amountOwed - initialPayment);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (lenderBorrowerBalances){
let afterFinalPaymentBorrowerBalance = lenderBorrowerBalances[0].toNumber();
let afterFinalPaymentLenderBalance = lenderBorrowerBalances[1].toNumber();
assert.equal(afterFinalPaymentBorrowerBalance, borrowerBalance - (amountOwed - initialPayment));
assert.equal(afterFinalPaymentLenderBalance, lenderBalance + (amountOwed - initialPayment));
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['COMPLETION_STATUS'], 'loan should initially be requested');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
})	
})
it("for mining loans, incremental payments should be kept in contract as borrower makes them", function (){
let loanIndex;
let initialPayment = 10;
let amountOwed = amount + interest;
let amountPaidBackSoFar = 0;
let lenderBalance;
let borrowerBalance;
let contractBalance;
let willMine = true;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return elixToken.balanceOf(tokenManagerInstance.address)
}).then( function(initContractBalance){
contractBalance = initContractBalance.toNumber();
return initialLoanPaymentMade(loanIndex, borrower, lender, amount, interest, willMine, initialPayment);  		
}).then( function (loanProperties){
borrowerBalance = loanProperties.initialBorrowerBalance;
lenderBalance = loanProperties.initialLenderBalance;
amountPaidBackSoFar = loanProperties.amountPaidBackSoFar;
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then(function(lenderBorrowerBalances){
let afterLoanBorrowerBalance = lenderBorrowerBalances[0].toNumber();
let afterLoanLenderBalance = lenderBorrowerBalances[1].toNumber();
assert.equal(afterLoanBorrowerBalance, borrowerBalance - initialPayment);
assert.equal(afterLoanLenderBalance, lenderBalance);
borrowerBalance = afterLoanBorrowerBalance;
lenderBalance = afterLoanLenderBalance;
return elixToken.balanceOf(tokenManagerInstance.address);
}).then( function (afterPaymentContractBalance){
let newContractBalance = afterPaymentContractBalance.toNumber();
assert.equal(newContractBalance, contractBalance+initialPayment);
})
})
it("after loan that will mine is fully paid the total interest + balance should be in mining", function (){
let loanIndex;
let initialPayment = 10;
let amountOwed = amount + interest;
let amountPaidBackSoFar = 0;
let lenderBalance;
let borrowerBalance;
let contractBalance;
let willMine = true;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return elixToken.balanceOf(tokenManagerInstance.address)
}).then( function(initContractBalance){
contractBalance = initContractBalance.toNumber();
return initialLoanPaymentMade(loanIndex, borrower, lender, amount, interest, willMine, initialPayment);  		
}).then( function (loanProperties){
borrowerBalance = loanProperties.initialBorrowerBalance;
lenderBalance = loanProperties.initialLenderBalance;
amountPaidBackSoFar = loanProperties.amountPaidBackSoFar;
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then(function(lenderBorrowerBalances){
let afterLoanBorrowerBalance = lenderBorrowerBalances[0].toNumber();
let afterLoanLenderBalance = lenderBorrowerBalances[1].toNumber();
assert.equal(afterLoanBorrowerBalance, borrowerBalance - initialPayment);
assert.equal(afterLoanLenderBalance, lenderBalance);
borrowerBalance = afterLoanBorrowerBalance;
lenderBalance = afterLoanLenderBalance;
return elixToken.balanceOf(tokenManagerInstance.address);
}).then( function (afterPaymentContractBalance){
let newContractBalance = afterPaymentContractBalance.toNumber();
assert.equal(newContractBalance, contractBalance+initialPayment);
contractBalance = newContractBalance;
return tokenManagerInstance.payAmountForLoanAtIndex((amountOwed - initialPayment), loanIndex, {from: borrower});
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
amountPaidBackSoFar += (amountOwed - initialPayment);
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['MINING_STATUS'], 'loan should be moved to mining after being paid back');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return elixToken.balanceOf(tokenManagerInstance.address);
}).then( function(afterFinalPaymentContractBalance){
let newContractBalance = afterFinalPaymentContractBalance.toNumber();
assert.equal(newContractBalance, contractBalance + (amountOwed - initialPayment));
})
})
it("should allow lender to claim reward after mining period over, lender and borrower get appropriate awards and lender also gets amount + interest returned", function (){
let loanIndex;
let willMine = true;
let startBlock;
let paidBackBlock;
let borrowerTokenPBalance;
let lenderTokenPBalance;
let borrowerElixBalance;
let lenderElixBalance;
// need to subtract from payBackTime the blocks advanced in the pay back function before loan payment
let payBackTime = length - 1 - 2;
let amount = 1000000000000;
let rewardClaimEventArr = [];
let totalAmount = amount + interest;
let rewardClaimEvent;
let expectedBorrowerReward;
let expectedLenderReward;
let amountPaidBackSoFar = 0;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return getTokenPBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
borrowerTokenPBalance = borrowerAndLenderBalances[0].toNumber();
lenderTokenPBalance = borrowerAndLenderBalances[1].toNumber();
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
borrowerElixBalance = borrowerAndLenderBalances[0].toNumber();
lenderElixBalance = borrowerAndLenderBalances[1].toNumber();
// simulate time passed before loan paid back
let blockAdvanceArr = []
for( let i = 0; i < payBackTime; i++){
blockAdvanceArr.push(tokenManagerInstance.advanceBlock()); 
}
return Promise.all(blockAdvanceArr);	
}).then( function (){
rewardClaimEvent = tokenManagerInstance.RewardForLoanIndexClaimedByAddress({fromBlock: 0, toBlock: 'latest'});
rewardClaimEvent.watch( function (err, response){
if(response.args.index.toNumber() == loanIndex){
rewardClaimEventArr.push(response.args);
}
})
}).then( function (){
return loanPaidBack(loanIndex, borrower, lender, amount, interest, willMine);
}).then( function(loanState){
amountPaidBackSoFar = (amountPaidBackSoFar + amount + interest);
startBlock = loanState[ loanArgKey['startBlock'] ].toNumber()
paidBackBlock = loanState[ loanArgKey['paidBackBlock'] ].toNumber()
function failCheck(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['MINING_STATUS'], 'loan should still be in mining if wait period not elapsed');
}
function successCheck(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['COMPLETION_STATUS'], 'loan should be marked as completed if reward claimed after waiting period');
}
return awaitBlock(startBlock, paidBackBlock, loanIndex, tokenManagerInstance.requestRewardForLoanAtIndex, lender, failCheck, successCheck)
}).then( function (){
return getTokenPBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterMiningBorrowerBal = borrowerAndLenderBalances[0].toNumber();
let afterMiningLenderBal = borrowerAndLenderBalances[1].toNumber();
expectedBorrowerReward = calculateMiningReward(startBlock, paidBackBlock, totalAmount, rewardFactorBorrower);
expectedLenderReward = calculateMiningReward(startBlock, paidBackBlock, totalAmount, rewardFactorLender);
assert.equal((afterMiningBorrowerBal - borrowerTokenPBalance), expectedBorrowerReward);
assert.equal((afterMiningLenderBal - lenderTokenPBalance), expectedLenderReward); 
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterMiningBorrowerElixBal = borrowerAndLenderBalances[0].toNumber();
let afterMiningLenderElixBal = borrowerAndLenderBalances[1].toNumber();
assert.equal(borrowerElixBalance, afterMiningBorrowerElixBal);
assert.equal((lenderElixBalance + amountPaidBackSoFar), afterMiningLenderElixBal);
return new Promise( function (resolve, reject){
setTimeout(resolve, 1500)
})
}).then( function (){
assert.isAtLeast(rewardClaimEventArr.length, 1, 'there are no events emitted within timeframe');
assert.equal(rewardClaimEventArr[0].claimer, lender);
assert.equal(rewardClaimEventArr[0].borrowerReward, expectedBorrowerReward);
assert.equal(rewardClaimEventArr[0].lenderReward, expectedLenderReward);
rewardClaimEvent.stopWatching();
})
})
it("2 -should allow lender to claim reward after mining period over, lender and borrower get appropriate awards and lender also gets amount + interest returned", function (){
let loanIndex;
let willMine = true;
let startBlock;
let paidBackBlock;
let borrowerTokenPBalance;
let lenderTokenPBalance;
let borrowerElixBalance;
let lenderElixBalance;
// need to subtract from payBackTime the blocks advanced in the pay back function before loan payment
let payBackTime = length - 1 - 2;
let amount = 1000000000000;
let rewardClaimEventArr = [];
let totalAmount = amount + interest;
let rewardClaimEvent;
let expectedBorrowerReward;
let expectedLenderReward;
let amountPaidBackSoFar = 0;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return getTokenPBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
borrowerTokenPBalance = borrowerAndLenderBalances[0].toNumber();
lenderTokenPBalance = borrowerAndLenderBalances[1].toNumber();
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
borrowerElixBalance = borrowerAndLenderBalances[0].toNumber();
lenderElixBalance = borrowerAndLenderBalances[1].toNumber();
// simulate time passed before loan paid back
let blockAdvanceArr = []
for( let i = 0; i < payBackTime; i++){
blockAdvanceArr.push(tokenManagerInstance.advanceBlock()); 
}
return Promise.all(blockAdvanceArr);	
}).then( function (){
rewardClaimEvent = tokenManagerInstance.RewardForLoanIndexClaimedByAddress({fromBlock: 0, toBlock: 'latest'});
rewardClaimEvent.watch( function (err, response){
if(response.args.index.toNumber() == loanIndex){
rewardClaimEventArr.push(response.args);
}
})
}).then( function (){
return loanPaidBack(loanIndex, borrower, lender, amount, interest, willMine);
}).then( function(loanState){
amountPaidBackSoFar = (amountPaidBackSoFar + amount + interest);
startBlock = loanState[ loanArgKey['startBlock'] ].toNumber()
paidBackBlock = loanState[ loanArgKey['paidBackBlock'] ].toNumber()
function failCheck(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['MINING_STATUS'], 'loan should still be in mining if wait period not elapsed');
}
function successCheck(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['COMPLETION_STATUS'], 'loan should be marked as completed if reward claimed after waiting period');
}
return awaitBlock(startBlock, paidBackBlock, loanIndex, tokenManagerInstance.requestRewardForLoanAtIndex, lender, failCheck, successCheck)
}).then( function (){
return getTokenPBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterMiningBorrowerBal = borrowerAndLenderBalances[0].toNumber();
let afterMiningLenderBal = borrowerAndLenderBalances[1].toNumber();
expectedBorrowerReward = calculateMiningReward(startBlock, paidBackBlock, totalAmount, rewardFactorBorrower);
expectedLenderReward = calculateMiningReward(startBlock, paidBackBlock, totalAmount, rewardFactorLender);
assert.equal((afterMiningBorrowerBal - borrowerTokenPBalance), expectedBorrowerReward);
assert.equal((afterMiningLenderBal - lenderTokenPBalance), expectedLenderReward); 
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterMiningBorrowerElixBal = borrowerAndLenderBalances[0].toNumber();
let afterMiningLenderElixBal = borrowerAndLenderBalances[1].toNumber();
assert.equal(borrowerElixBalance, afterMiningBorrowerElixBal);
assert.equal((lenderElixBalance + amountPaidBackSoFar), afterMiningLenderElixBal);
return new Promise( function (resolve, reject){
setTimeout(resolve, 1500)
})
}).then( function (){
assert.isAtLeast(rewardClaimEventArr.length, 1, 'there are no events emitted within timeframe');
assert.equal(rewardClaimEventArr[0].claimer, lender);
assert.equal(rewardClaimEventArr[0].borrowerReward, expectedBorrowerReward);
assert.equal(rewardClaimEventArr[0].lenderReward, expectedLenderReward);
rewardClaimEvent.stopWatching();
})
})
it("should allow borrower to claim reward after mining period over", function (){
let loanIndex;
let willMine = true;
let startBlock;
let paidBackBlock;
let borrowerTokenPBalance;
let lenderTokenPBalance;
let payBackTime = Math.floor(length/5);
let amount = 1000000000000;
let rewardClaimEventArr = [];
let totalAmount = amount + interest;
let rewardClaimEvent;
let expectedBorrowerReward;
let expectedLenderReward;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
startBlock = loanProperties.startBlock;
return getTokenPBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
borrowerTokenPBalance = borrowerAndLenderBalances[0];
lenderTokenPBalance = borrowerAndLenderBalances[1];
// simulate time passed before loan paid back
let blockAdvanceArr = []
for( let i = 0; i < payBackTime; i++){
blockAdvanceArr.push(tokenManagerInstance.advanceBlock())
}
return Promise.all(blockAdvanceArr);	
}).then( function (b){
rewardClaimEvent = tokenManagerInstance.RewardForLoanIndexClaimedByAddress({fromBlock: 0, toBlock: 'latest'});
rewardClaimEvent.watch( function (err, response){
if(response.args.index.toNumber() == loanIndex){
rewardClaimEventArr.push(response.args);
}
})
}).then( function (){
return loanPaidBack(loanIndex, borrower, lender, amount, interest, willMine);
}).then( function(loanState){
startBlock = loanState[ loanArgKey['startBlock'] ].toNumber()
paidBackBlock = loanState[ loanArgKey['paidBackBlock'] ].toNumber()
function failCheck(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['MINING_STATUS'], 'loan should still be in mining if wait period not elapsed');
}
function successCheck(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['COMPLETION_STATUS'], 'loan should be marked as completed if reward claimed after waiting period');
}
return awaitBlock(startBlock, paidBackBlock, loanIndex, tokenManagerInstance.requestRewardForLoanAtIndex, borrower, failCheck, successCheck)
}).then( function (){
return getTokenPBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterMiningBorrowerBal = borrowerAndLenderBalances[0].toNumber();
let afterMiningLenderBal = borrowerAndLenderBalances[1].toNumber();
expectedBorrowerReward = calculateMiningReward(startBlock, paidBackBlock, totalAmount, rewardFactorBorrower);
expectedLenderReward = calculateMiningReward(startBlock, paidBackBlock, totalAmount, rewardFactorLender);
assert.equal((afterMiningBorrowerBal - borrowerTokenPBalance), expectedBorrowerReward);
assert.equal((afterMiningLenderBal - lenderTokenPBalance), expectedLenderReward); 
return new Promise( function (resolve, reject){
setTimeout(resolve, 1500)
})
}).then( function (){
assert.isAtLeast(rewardClaimEventArr.length, 1, 'there are no events emitted within timeframe');
assert.equal(rewardClaimEventArr[0].claimer, borrower);
assert.equal(rewardClaimEventArr[0].borrowerReward, expectedBorrowerReward);
assert.equal(rewardClaimEventArr[0].lenderReward, expectedLenderReward);
rewardClaimEvent.stopWatching();
})
})
it("should allow lender to claim all mining reward after mining period over if borrower paid back late", function (){
let loanIndex;
let willMine = true;
let startBlock;
let paidBackBlock;
let borrowerTokenPBalance;
let lenderTokenPBalance;
let payBackTime = length + 10;
let amount = 1000000000000;
let rewardClaimEventArr = [];
let totalAmount = amount + interest;
let rewardClaimEvent;
let expectedBorrowerReward;
let expectedLenderReward;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return getTokenPBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
borrowerTokenPBalance = borrowerAndLenderBalances[0];
lenderTokenPBalance = borrowerAndLenderBalances[1];
// simulate time passed before loan paid back
let blockAdvanceArr = []
for( let i = 0; i < payBackTime; i++){
blockAdvanceArr.push(tokenManagerInstance.advanceBlock());
}
return Promise.all(blockAdvanceArr);	
}).then( function (){
rewardClaimEvent = tokenManagerInstance.RewardForLoanIndexClaimedByAddress({fromBlock: 0, toBlock: 'latest'});
rewardClaimEvent.watch( function (err, response){
if(response.args.index.toNumber() == loanIndex){
rewardClaimEventArr.push(response.args);
}
})
}).then( function (){
return loanPaidBack(loanIndex, borrower, lender, amount, interest, willMine);
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['MINING_STATUS'], 'loan should be marked as borrower paid late');
startBlock = loanState[ loanArgKey['startBlock'] ].toNumber()
paidBackBlock = loanState[ loanArgKey['paidBackBlock'] ].toNumber()
function failCheck(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['MINING_STATUS'], 'loan should still be in mining if wait period not elapsed');
}
function successCheck(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['COMPLETION_STATUS'], 'loan should be marked as completed if reward claimed after waiting period');
}
return awaitBlock(startBlock, paidBackBlock, loanIndex, tokenManagerInstance.requestRewardForLoanAtIndex, lender, failCheck, successCheck)
}).then( function (){
return getTokenPBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterMiningBorrowerBal = borrowerAndLenderBalances[0].toNumber();
let afterMiningLenderBal = borrowerAndLenderBalances[1].toNumber();
expectedBorrowerReward = 0;
expectedLenderReward = calculateMiningReward(startBlock, paidBackBlock, totalAmount, rewardFactorLender) + calculateMiningReward(startBlock, paidBackBlock, totalAmount, rewardFactorBorrower);
assert.equal((afterMiningBorrowerBal - borrowerTokenPBalance), expectedBorrowerReward);
assert.equal((afterMiningLenderBal - lenderTokenPBalance), expectedLenderReward); 
return new Promise( function (resolve, reject){
setTimeout(resolve, 1500)
})
}).then( function (){
assert.isAtLeast(rewardClaimEventArr.length, 1, 'there are no events emitted within timeframe');
assert.equal(rewardClaimEventArr[0].claimer, lender);
assert.equal(rewardClaimEventArr[0].borrowerReward, expectedBorrowerReward);
assert.equal(rewardClaimEventArr[0].lenderReward, expectedLenderReward);
rewardClaimEvent.stopWatching();
})
})
it("should not allow party that is not borrower or lender to claim mining reward", function (){
let loanIndex;
let willMine = true;
let startBlock;
let paidBackBlock;
let borrowerTokenPBalance;
let lenderTokenPBalance;
let payBackTime = length/2;
let amount = 1000000000000;
let totalAmount = amount + interest;
let expectedBorrowerReward;
let expectedLenderReward;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return getTokenPBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
borrowerTokenPBalance = borrowerAndLenderBalances[0];
lenderTokenPBalance = borrowerAndLenderBalances[1];
// simulate time passed before loan paid back
let blockAdvanceArr = []
for( let i = 0; i < payBackTime; i++){
return tokenManagerInstance.advanceBlock();
}
return Promise.all(blockAdvanceArr);	
}).then( function (){
return loanPaidBack(loanIndex, borrower, lender, amount, interest, willMine);
}).then( function(loanState){
startBlock = loanState[ loanArgKey['startBlock'] ].toNumber()
paidBackBlock = loanState[ loanArgKey['paidBackBlock'] ].toNumber()
function failCheck(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['MINING_STATUS'], 'loan should still be in mining if wait period not elapsed');
}
function successCheck(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['COMPLETION_STATUS'], 'loan should be marked as completed if reward claimed after waiting period');
}
return awaitBlock(startBlock, paidBackBlock, loanIndex, tokenManagerInstance.requestRewardForLoanAtIndex, lender, failCheck, successCheck)
}).then( function (){
return getTokenPBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let afterMiningBorrowerBal = borrowerAndLenderBalances[0].toNumber();
let afterMiningLenderBal = borrowerAndLenderBalances[1].toNumber();
expectedBorrowerReward = calculateMiningReward(startBlock, paidBackBlock, totalAmount, rewardFactorBorrower);
expectedLenderReward = calculateMiningReward(startBlock, paidBackBlock, totalAmount, rewardFactorLender);
assert.equal((afterMiningBorrowerBal - borrowerTokenPBalance), expectedBorrowerReward);
assert.equal((afterMiningLenderBal - lenderTokenPBalance), expectedLenderReward); 
})
})
it("should allow borrower to cancel loan request before its accepted", function(){
let loanIndex;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
loanIndex = ret.logs[0].args.index.toNumber();
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should be requested when it is created before it is approved by lender');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
return tokenManagerInstance.cancelLoanRequestAtIndexByBorrower(loanIndex, {from: borrower})
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUEST_CANCELED_BY_BORROWER_STATUS'], 'loan should be marked as cancelled by borrower');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
})
})
it("should not allow lender to accept loan cancelled by borrower", function(){
let loanIndex;
let lenderBalance;
return distributeTokensToOneUser(lender, amount).then( function (userBalance){
lenderBalance = userBalance;
assert.isAtLeast(userBalance, amount);
}).then( function (){
return elixToken.approve(tokenManagerInstance.address, amount, {from: lender});
}).then( function (){
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower})
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
loanIndex = ret.logs[0].args.index.toNumber();
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should be requested when it is created before it is approved by lender');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
return tokenManagerInstance.cancelLoanRequestAtIndexByBorrower(loanIndex, {from: borrower})
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUEST_CANCELED_BY_BORROWER_STATUS'], 'loan should be marked as cancelled by borrower');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return elixToken.balanceOf(lender);
}).then( function (userBalance){
// lender balance should remain unchanged
assert.equal(lenderBalance, userBalance.toNumber());
})
})
it("should not allow non-borrower to cancel loan request before its accepted", function(){
let loanIndex;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
loanIndex = ret.logs[0].args.index.toNumber();
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should be requested when it is created before it is approved by lender');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return tokenManagerInstance.cancelLoanRequestAtIndexByBorrower(loanIndex, {from: user2})
}).then( function (ret){
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should be requested when it is created before it is approved by lender');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
})
})
it("should allow lender to cancel loan request", function(){
let loanIndex;
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
loanIndex = ret.logs[0].args.index.toNumber();
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should be requested when it is created before it is approved by lender');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
return tokenManagerInstance.cancelLoanRequestAtIndexByLender(loanIndex, {from: lender})
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUEST_CANCELED_BY_LENDER_STATUS'], 'loan should be marked as cancelled by lender');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
})
})
it("should not allow lender to accept loan cancelled by lender", function(){
let loanIndex;
let lenderBalance;
return distributeTokensToOneUser(lender, amount).then( function (userBalance){
lenderBalance = userBalance;
assert.isAtLeast(userBalance, amount);
}).then( function (){
return elixToken.approve(tokenManagerInstance.address, amount, {from: lender});
}).then( function (){
return tokenManagerInstance.requestLoan(lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage, {from: borrower})
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
loanIndex = ret.logs[0].args.index.toNumber();
return tokenManagerInstance.loans.call(loanIndex)
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUESTED_STATUS'], 'loan should be requested when it is created before it is approved by lender');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine)
return tokenManagerInstance.cancelLoanRequestAtIndexByLender(loanIndex, {from: lender})
}).then( function (ret){
assert.isOk(ret);
assert.typeOf(ret, 'object');
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['REQUEST_CANCELED_BY_LENDER_STATUS'], 'loan should be marked as cancelled by borrower');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return elixToken.balanceOf(lender);
}).then( function (userBalance){
// lender balance should remain unchanged
assert.equal(lenderBalance, userBalance.toNumber());
})
})
it("should allow lender to cancel accepted nonmining loan", function (){
let loanIndex;
let lenderBalance;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function (loanProperties){
loanIndex = loanProperties.index;
lenderBalance = loanProperties.lenderBalance;
return tokenManagerInstance.cancelActiveLoanAtIndex(loanIndex, {from: lender})
}).then( function (ret){
return tokenManagerInstance.loans.call(loanIndex);
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_LOAN_CANCELED_BY_LENDER_STATUS'], 'loan should be marked as cancelled by borrower');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return elixToken.balanceOf(lender)
}).then( function (userBalance){
assert.equal(lenderBalance, userBalance.toNumber());
});
})
it("should allow lender to cancel accepted nonmining loan with partial payments made", function (){
let loanIndex;
let lenderBalance;
let initialPayment = Math.floor(amount/3);
let amountPaidBackSoFar = 0;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function (loanProperties){
loanIndex = loanProperties.index;
lenderBalance = loanProperties.lenderBalance;
return initialLoanPaymentMade(loanIndex, borrower, lender, amount, interest, willMine, initialPayment);
}).then( function (){
amountPaidBackSoFar+=initialPayment;
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let newBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let newLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal(lenderBalance + initialPayment, newLenderBalance);
lenderBalance = newLenderBalance;
return tokenManagerInstance.cancelActiveLoanAtIndex(loanIndex, {from: lender})
}).then( function (ret){
return tokenManagerInstance.loans.call(loanIndex);
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_LOAN_CANCELED_BY_LENDER_STATUS'], 'loan should be marked as cancelled by borrower');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return elixToken.balanceOf(lender)
}).then( function (userBalance){
assert.equal(lenderBalance, userBalance.toNumber());
});
})
it("should not allow borrower to make payments to cancelled active loan", function (){
let loanIndex;
let lenderBalance;
let borrowerBalance;
let initialPayment = Math.floor(amount/3);
let amountPaidBackSoFar = 0;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function (loanProperties){
loanIndex = loanProperties.index;
lenderBalance = loanProperties.lenderBalance;
return initialLoanPaymentMade(loanIndex, borrower, lender, amount, interest, willMine, initialPayment);
}).then( function (){
amountPaidBackSoFar+=initialPayment;
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let newBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let newLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal(lenderBalance + initialPayment, newLenderBalance);
lenderBalance = newLenderBalance;
borrowerBalance = newBorrowerBalance;
return tokenManagerInstance.cancelActiveLoanAtIndex(loanIndex, {from: lender})
}).then( function (ret){
return tokenManagerInstance.loans.call(loanIndex);
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_LOAN_CANCELED_BY_LENDER_STATUS'], 'loan should be marked as cancelled by borrower');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return elixToken.balanceOf(lender)
}).then( function (userBalance){
assert.equal(lenderBalance, userBalance.toNumber());
return tokenManagerInstance.payAmountForLoanAtIndex(initialPayment, loanIndex, {from: borrower});
}).then( function (){
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_LOAN_CANCELED_BY_LENDER_STATUS'], 'loan should be marked as cancelled by borrower');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
let newBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let newLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal(lenderBalance, newLenderBalance);
assert.equal(borrowerBalance, newBorrowerBalance)
lenderBalance = newLenderBalance;
});
})
it("should not lender to cancel accepted mining loan without borrower confirmation", function (){
let loanIndex;
let initialPayment = 10;
let amountOwed = amount + interest;
let amountPaidBackSoFar = 0;
let lenderBalance;
let borrowerBalance;
let contractBalance;
let willMine = true;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return elixToken.balanceOf(tokenManagerInstance.address)
}).then( function(initContractBalance){
contractBalance = initContractBalance.toNumber();
return initialLoanPaymentMade(loanIndex, borrower, lender, amount, interest, willMine, initialPayment);  		
}).then( function (loanProperties){
borrowerBalance = loanProperties.initialBorrowerBalance;
lenderBalance = loanProperties.initialLenderBalance;
amountPaidBackSoFar = loanProperties.amountPaidBackSoFar;
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then(function(lenderBorrowerBalances){
let afterLoanBorrowerBalance = lenderBorrowerBalances[0].toNumber();
let afterLoanLenderBalance = lenderBorrowerBalances[1].toNumber();
assert.equal(afterLoanBorrowerBalance, borrowerBalance - initialPayment);
assert.equal(afterLoanLenderBalance, lenderBalance);
borrowerBalance = afterLoanBorrowerBalance;
lenderBalance = afterLoanLenderBalance;
return elixToken.balanceOf(tokenManagerInstance.address);
}).then( function (afterPaymentContractBalance){
let newContractBalance = afterPaymentContractBalance.toNumber();
assert.equal(newContractBalance, contractBalance+initialPayment);
return tokenManagerInstance.cancelActiveLoanAtIndex(loanIndex, {from: lender});
}).then( function (ret){
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should be marked as cancelled by borrower');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
// nothing should be transferred without borrower confirmation
let newBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let newLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal(lenderBalance, newLenderBalance);
assert.equal(borrowerBalance, newBorrowerBalance);
})
})
it("should allow lender to request to cancel accepted mining loan with partial payments made and receive current payments after borrower approves cancellation", function (){
let loanIndex;
let initialPayment = 10;
let amountOwed = amount + interest;
let amountPaidBackSoFar = 0;
let lenderBalance;
let borrowerBalance;
let contractBalance;
let willMine = true;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return elixToken.balanceOf(tokenManagerInstance.address)
}).then( function(initContractBalance){
contractBalance = initContractBalance.toNumber();
return initialLoanPaymentMade(loanIndex, borrower, lender, amount, interest, willMine, initialPayment);  		
}).then( function (loanProperties){
borrowerBalance = loanProperties.initialBorrowerBalance;
lenderBalance = loanProperties.initialLenderBalance;
amountPaidBackSoFar = loanProperties.amountPaidBackSoFar;
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then(function(lenderBorrowerBalances){
let afterLoanBorrowerBalance = lenderBorrowerBalances[0].toNumber();
let afterLoanLenderBalance = lenderBorrowerBalances[1].toNumber();
assert.equal(afterLoanBorrowerBalance, borrowerBalance - initialPayment);
assert.equal(afterLoanLenderBalance, lenderBalance);
borrowerBalance = afterLoanBorrowerBalance;
lenderBalance = afterLoanLenderBalance;
return elixToken.balanceOf(tokenManagerInstance.address);
}).then( function (afterPaymentContractBalance){
let newContractBalance = afterPaymentContractBalance.toNumber();
assert.equal(newContractBalance, contractBalance+initialPayment);
return tokenManagerInstance.cancelActiveLoanAtIndex(loanIndex, {from: lender});
}).then( function (ret){
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should still be active');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
// after cancelled, the amount being held in the contract should be transferred back to the lender
let newBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let newLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal(lenderBalance, newLenderBalance);
assert.equal(borrowerBalance, newBorrowerBalance);
return tokenManagerInstance.agreeCancelActiveLoanAtIndex(loanIndex, {from: borrower});
}).then( function (){
return tokenManagerInstance.loans.call(loanIndex); 
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_LOAN_CANCELED_BY_LENDER_STATUS'], 'loan should be marked as cancelled by borrower');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
// after cancelled, the amount being held in the contract should be transferred back to the lender
let newBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let newLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal(lenderBalance + amountPaidBackSoFar, newLenderBalance);
assert.equal(borrowerBalance, newBorrowerBalance);
})
})
it("loan should go into mining if borrower does not approve lender cancel request for mining loan", function (){
let loanIndex;
let initialPayment = 10;
let amountOwed = amount + interest;
let amountPaidBackSoFar = 0;
let lenderBalance;
let borrowerBalance;
let contractBalance;
let nextPayment;
let willMine = true;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return elixToken.balanceOf(tokenManagerInstance.address)
}).then( function(initContractBalance){
contractBalance = initContractBalance.toNumber();
return initialLoanPaymentMade(loanIndex, borrower, lender, amount, interest, willMine, initialPayment);     
}).then( function (loanProperties){
borrowerBalance = loanProperties.initialBorrowerBalance;
lenderBalance = loanProperties.initialLenderBalance;
amountPaidBackSoFar = loanProperties.amountPaidBackSoFar;
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then(function(lenderBorrowerBalances){
let afterLoanBorrowerBalance = lenderBorrowerBalances[0].toNumber();
let afterLoanLenderBalance = lenderBorrowerBalances[1].toNumber();
assert.equal(afterLoanBorrowerBalance, borrowerBalance - initialPayment);
assert.equal(afterLoanLenderBalance, lenderBalance);
borrowerBalance = afterLoanBorrowerBalance;
lenderBalance = afterLoanLenderBalance;
return elixToken.balanceOf(tokenManagerInstance.address);
}).then( function (afterPaymentContractBalance){
let newContractBalance = afterPaymentContractBalance.toNumber();
assert.equal(newContractBalance, contractBalance+initialPayment);
return tokenManagerInstance.cancelActiveLoanAtIndex(loanIndex, {from: lender});
}).then( function (ret){
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should still be active');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
// after cancelled, the amount being held in the contract should be transferred back to the lender
let newBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let newLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal(lenderBalance, newLenderBalance);
assert.equal(borrowerBalance, newBorrowerBalance);
borrowerBalance = newBorrowerBalance;
lenderBalance = newLenderBalance;
nextPayment = amountOwed - amountPaidBackSoFar;
return tokenManagerInstance.payAmountForLoanAtIndex(nextPayment, loanIndex, {from: borrower});
}).then( function (){
amountPaidBackSoFar += nextPayment;
return tokenManagerInstance.loans.call(loanIndex); 
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['MINING_STATUS'], 'loan should go into mining as usual');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
// while loan in mining lender shouldnt be paid yet but borrower should have last payment deducted
let newBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let newLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal(lenderBalance, newLenderBalance);
assert.equal((borrowerBalance - nextPayment), newBorrowerBalance);
})
})
it("should not allow lender to approve the cancel request", function (){
let loanIndex;
let initialPayment = 10;
let amountOwed = amount + interest;
let amountPaidBackSoFar = 0;
let lenderBalance;
let borrowerBalance;
let contractBalance;
let willMine = true;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
return elixToken.balanceOf(tokenManagerInstance.address)
}).then( function(initContractBalance){
contractBalance = initContractBalance.toNumber();
return initialLoanPaymentMade(loanIndex, borrower, lender, amount, interest, willMine, initialPayment);  		
}).then( function (loanProperties){
borrowerBalance = loanProperties.initialBorrowerBalance;
lenderBalance = loanProperties.initialLenderBalance;
amountPaidBackSoFar = loanProperties.amountPaidBackSoFar;
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then(function(lenderBorrowerBalances){
let afterLoanBorrowerBalance = lenderBorrowerBalances[0].toNumber();
let afterLoanLenderBalance = lenderBorrowerBalances[1].toNumber();
assert.equal(afterLoanBorrowerBalance, borrowerBalance - initialPayment);
assert.equal(afterLoanLenderBalance, lenderBalance);
borrowerBalance = afterLoanBorrowerBalance;
lenderBalance = afterLoanLenderBalance;
return elixToken.balanceOf(tokenManagerInstance.address);
}).then( function (afterPaymentContractBalance){
let newContractBalance = afterPaymentContractBalance.toNumber();
assert.equal(newContractBalance, contractBalance+initialPayment);
return tokenManagerInstance.cancelActiveLoanAtIndex(loanIndex, {from: lender});
}).then( function (ret){
return tokenManagerInstance.loans.call(loanIndex);
}).then( function (loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should still be active');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
// funds should not be transferred
let newBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let newLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal(lenderBalance, newLenderBalance);
assert.equal(borrowerBalance, newBorrowerBalance);
return tokenManagerInstance.agreeCancelActiveLoanAtIndex(loanIndex, {from: lender});
}).then( function (){
return tokenManagerInstance.loans.call(loanIndex); 
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should still be active');
standardLoanStateChecks(loanState, lender, borrower, amount, interest, amountPaidBackSoFar, willMine);
return getElixBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
// funds should not be transferred
let newBorrowerBalance = borrowerAndLenderBalances[0].toNumber();
let newLenderBalance = borrowerAndLenderBalances[1].toNumber();
assert.equal(lenderBalance, newLenderBalance);
assert.equal(borrowerBalance, newBorrowerBalance);
})
})
it("should allow lender to cancel mining for loan only if loan paid back late", function (){
let loanIndex;
let willMine = true;
let startBlock;
let paidBackBlock;
let borrowerTokenPBalance;
let lenderTokenPBalance;
let payBackTime = length + 10;
let amount = 1000000000000;
let rewardClaimEventArr = [];
let totalAmount = amount + interest;
let rewardClaimEvent;
let expectedBorrowerReward;
let expectedLenderReward;
return loanCreatedAndAccepted(borrower, lender, volAddress, amount, length, interest, willMine, requestCancel, loanMessage).then( function(loanProperties){
loanIndex = loanProperties.index;
startBlock = loanProperties.startBlock;
return getTokenPBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
borrowerTokenPBalance = borrowerAndLenderBalances[0];
lenderTokenPBalance = borrowerAndLenderBalances[1];
function failCheck(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should still be active');
assert.equal(loanState[ loanArgKey['willMine'] ], true, 'willMine check');
}
function successCheck(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['ACTIVE_STATUS'], 'loan should still be active');
assert.equal(loanState[ loanArgKey['willMine'] ], false, 'willMine check');
}
return awaitBlockDuration(startBlock, length, loanIndex, tokenManagerInstance.cancelMiningForLateLoanAtIndex, lender, failCheck, successCheck)
}).then( function (){
willMine = false;
rewardClaimEvent = tokenManagerInstance.RewardForLoanIndexClaimedByAddress({fromBlock: 0, toBlock: 'latest'});
rewardClaimEvent.watch( function (err, response){
if(response.args.index.toNumber() == loanIndex){
rewardClaimEventArr.push(response.args);
}
})
}).then( function (){
return loanPaidBack(loanIndex, borrower, lender, amount, interest, willMine);
}).then( function(loanState){
assert.equal(loanState[ loanArgKey['status'] ].toNumber(), loanStatusKey['COMPLETION_STATUS'], 'loan should not go into mining');
paidBackBlock = loanState[ loanArgKey['paidBackBlock'] ].toNumber()
return tokenManagerInstance.requestRewardForLoanAtIndex(loanIndex, {from: lender})
}).then( function (){
return getTokenPBalancesOfBorrowerAndLender(borrower, lender);
}).then( function (borrowerAndLenderBalances){
// should not be able to receive mining reward
let afterMiningBorrowerBal = borrowerAndLenderBalances[0].toNumber();
let afterMiningLenderBal = borrowerAndLenderBalances[1].toNumber();
expectedBorrowerReward = 0;
expectedLenderReward = 0;
assert.equal((afterMiningBorrowerBal - borrowerTokenPBalance), expectedBorrowerReward);
assert.equal((afterMiningLenderBal - lenderTokenPBalance), expectedLenderReward); 
return new Promise( function (resolve, reject){
setTimeout(resolve, 1500)
})
}).then( function (){
assert.isAtLeast(rewardClaimEventArr.length, 0, 'there should not be any events emitted');
rewardClaimEvent.stopWatching();
})
})
it("should return total supply", function(){
return tokenPToken.totalSupply().then( function (supply){
let totalSupply = supply.toNumber();
assert.typeOf(totalSupply, 'number');
});
})
})