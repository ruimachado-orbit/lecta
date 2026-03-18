// JavaScript Demo - Hello Lecta!

const languages = ['JavaScript', 'Python', 'SQL', 'Node.js'];

console.log('Hello from Lecta!');
console.log('');
console.log('Supported execution engines:');

languages.forEach((lang, i) => {
  console.log(`  ${i + 1}. ${lang}`);
});

console.log('');
console.log(`Total: ${languages.length} engines ready to go!`);

// Try modifying this code and running it again
const greeting = 'Welcome to live coding!';
console.log(greeting);
