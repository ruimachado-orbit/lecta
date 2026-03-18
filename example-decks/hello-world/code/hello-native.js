// Native Node.js execution demo
// This runs on your actual machine via child_process

const os = require('os');
const path = require('path');

console.log('=== Native Node.js Execution ===');
console.log();
console.log(`Node.js: ${process.version}`);
console.log(`Platform: ${os.platform()} ${os.arch()}`);
console.log(`User: ${os.userInfo().username}`);
console.log(`Hostname: ${os.hostname()}`);
console.log(`CPUs: ${os.cpus().length} cores`);
console.log(`Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB total`);
console.log(`Working directory: ${process.cwd()}`);
console.log();
console.log('This code ran natively on your machine!');
