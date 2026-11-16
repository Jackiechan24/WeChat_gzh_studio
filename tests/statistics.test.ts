import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countArticleText } from '../src/statistics';

test('本次 4208 字符样本的英文和数字分组后为 3938 字', () => {
  const english = [...Array(78).fill('Word'), 'abcdefghijklmnopqrstuvwxyz'];
  const numbers = [...Array(16).fill('1'), '123456789012'];
  const text = '中'.repeat(3842) + english.join(' ') + '\n' + numbers.join(' ');
  assert.equal(english.join('').length, 338);
  assert.equal(numbers.join('').length, 28);
  assert.deepEqual(countArticleText(text), { characters: 4208, wechatWords: 3938 });
});

test('英文单词、数字组和中英文标点分别计数', () => {
  assert.deepEqual(countArticleText('使用 WorkBuddy 2026。'), { characters: 16, wechatWords: 5 });
  assert.equal(countArticleText('AI2026').wechatWords, 2);
  assert.equal(countArticleText('38.2%').wechatWords, 4);
});

test('分组前保留词间空格与段落边界，避免把多个英文单词合并', () => {
  assert.equal(countArticleText('Work Buddy').wechatWords, 2);
  assert.equal(countArticleText('Work\nBuddy').wechatWords, 2);
  assert.equal(countArticleText('WorkBuddy').wechatWords, 1);
  assert.equal(countArticleText('标题。\n正文！').wechatWords, 6);
  assert.deepEqual(countArticleText(' \n\t'), { characters: 0, wechatWords: 0 });
});
