#!/usr/bin/env node

/**
 * 이 스크립트는 특정 파일 또는 모든 컴포넌트의 접근성 테스트를 실행하고
 * 결과를 HTML 보고서로 생성합니다.
 * 
 * 사용법:
 * - 단일 파일 테스트: node scripts/test-a11y.js --file=path/to/file.js
 * - 특정 디렉토리의 모든 파일 테스트: node scripts/test-a11y.js --dir=path/to/dir
 * - 모든 스토리 테스트: node scripts/test-a11y.js --all
 */

import { Command } from 'commander';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import glob from 'glob';
import chalk from 'chalk';

const program = new Command();

program
  .description('접근성 테스트 실행 및 보고서 생성 도구')
  .option('--file <path>', '단일 파일 테스트')
  .option('--dir <path>', '디렉토리의 모든 파일 테스트')
  .option('--all', '모든 스토리 테스트')
  .option('--output <path>', '보고서 출력 경로', './a11y-reports')
  .parse(process.argv);

const options = program.opts();

if (!options.file && !options.dir && !options.all) {
  console.log(chalk.yellow('옵션을 지정하지 않았습니다. 모든 스토리를 테스트합니다.'));
  options.all = true;
}

// 출력 디렉토리가 없으면 생성
if (!fs.existsSync(options.output)) {
  fs.mkdirSync(options.output, { recursive: true });
}

if (options.file) {
  console.log(chalk.blue(`파일 ${options.file}에 대한 접근성 테스트를 실행합니다...`));
  const result = spawnSync('npm', ['run', 'a11y:story', options.file], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(chalk.red('테스트 실행 중 오류가 발생했습니다.'));
    process.exit(1);
  }
} else if (options.dir) {
  console.log(chalk.blue(`디렉토리 ${options.dir}의 파일에 대한 접근성 테스트를 실행합니다...`));
  const storyFiles = glob.sync(`${options.dir}/**/*.stories.js`);
  
  if (storyFiles.length === 0) {
    console.log(chalk.yellow('테스트할 스토리 파일을 찾을 수 없습니다.'));
    process.exit(0);
  }
  
  console.log(chalk.green(`${storyFiles.length}개의 스토리 파일을 찾았습니다.`));
  
  for (const file of storyFiles) {
    console.log(chalk.blue(`파일 ${file}에 대한 접근성 테스트를 실행합니다...`));
    const result = spawnSync('npm', ['run', 'a11y:story', file], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.warn(chalk.yellow(`${file} 테스트 실행 중 오류가 발생했습니다. 다음 파일로 계속 진행합니다.`));
    }
  }
} else if (options.all) {
  console.log(chalk.blue('모든 스토리에 대한 접근성 테스트를 실행합니다...'));
  const result = spawnSync('npm', ['run', 'a11y:all'], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(chalk.red('테스트 실행 중 오류가 발생했습니다.'));
    process.exit(1);
  }
}

console.log(chalk.green(`테스트가 완료되었습니다. 보고서는 ${options.output} 디렉토리에서 확인할 수 있습니다.`)); 