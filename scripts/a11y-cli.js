#!/usr/bin/env node

/**
 * 스토리북 컴포넌트의 접근성 검사를 위한 간소화된 CLI 도구
 * 이 스크립트는 @storybook/addon-a11y를 사용하여 접근성 검사를 수행합니다.
 * 
 * 사용법:
 * - 특정 디렉토리 검사: node scripts/a11y-cli.js --dir=stories/Button
 * - 특정 파일 검사: node scripts/a11y-cli.js --file=stories/Button/button.stories.js
 */

import fs from 'fs';
import path from 'path';
import glob from 'glob';
import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'child_process';

// axe-core 직접 사용
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const program = new Command();

program
  .description('스토리북 컴포넌트 접근성 검사 CLI 도구')
  .option('--dir <directory>', '특정 디렉토리의 모든 HTML 파일 검사')
  .option('--file <file>', '특정 HTML 파일 검사')
  .option('--output <directory>', '보고서 출력 디렉토리', './a11y-reports')
  .parse(process.argv);

const options = program.opts();

if (!options.dir && !options.file) {
  console.log(chalk.yellow('옵션을 지정하지 않았습니다. 전체 컴포넌트를 검사합니다.'));
  options.dir = './stories';
}

// HTML 파일 목록 가져오기
let htmlFiles = [];
if (options.dir) {
  htmlFiles = glob.sync(`${options.dir}/**/*.html`);
  console.log(chalk.blue(`${options.dir} 디렉토리에서 ${htmlFiles.length}개의 HTML 파일을 찾았습니다.`));
} else if (options.file) {
  if (fs.existsSync(options.file)) {
    htmlFiles = [options.file];
    console.log(chalk.blue(`${options.file} 파일을 검사합니다.`));
  } else {
    console.error(chalk.red(`${options.file} 파일을 찾을 수 없습니다.`));
    process.exit(1);
  }
}

// 출력 디렉토리 확인
if (!fs.existsSync(options.output)) {
  fs.mkdirSync(options.output, { recursive: true });
  console.log(chalk.blue(`${options.output} 디렉토리를 생성했습니다.`));
}

/**
 * HTML 파일을 axe-core로 검사하는 함수
 */
async function testHtmlFile(filePath) {
  console.log(chalk.blue(`${filePath} 파일을 검사합니다...`));
  
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    
    // JSDOM 설정 수정
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true
    });
    
    // axe-core 직접 호출 대신 콘텐츠 분석
    const document = dom.window.document;
    
    // axe 초기화 및 실행을 try-catch로 감싸기
    try {
      // axe 객체 설정
      dom.window.axe = axe;
      
      // 글로벌 객체 설정
      global.window = dom.window;
      global.document = document;
      
      // axe 설정 (axe.configure)
      axe.configure({
        reporter: 'v2',
        removeOtherNodes: false,
        iframes: false,
        // 최소한의 규칙만 활성화
        rules: [
          { id: 'label', enabled: true },
          { id: 'color-contrast', enabled: true },
          { id: 'image-alt', enabled: true },
          { id: 'link-name', enabled: true },
          { id: 'heading-order', enabled: true },
          { id: 'list', enabled: true },
          { id: 'listitem', enabled: true }
        ]
      });
      
      // DOM 처리를 위한 다양한 조건 추가
      if (!document.body) {
        return { violations: [], passes: [] };
      }
      
      // axe 실행
      const results = await axe.run(document);
      
      // 글로벌 삭제
      delete global.window;
      delete global.document;
      
      // 결과 저장
      const outputFile = path.join(options.output, `${path.basename(filePath, '.html')}-a11y-report.html`);
      generateReport(results, outputFile, filePath);
      
      // 결과 출력
      console.log(chalk.green(`검사 완료: ${filePath}`));
      console.log(`  위반 항목: ${chalk.red(results.violations.length)}개`);
      console.log(`  통과 항목: ${chalk.green(results.passes.length)}개`);
      
      // 위반 항목이 있으면 간단히 출력
      if (results.violations.length > 0) {
        console.log(chalk.yellow('\n주요 위반 항목:'));
        results.violations.forEach((violation, index) => {
          console.log(`  ${index + 1}. ${chalk.red(violation.id)}: ${violation.help} (중요도: ${violation.impact})`);
        });
      }
      
      return results;
    } catch (axeError) {
      console.error(chalk.red(`axe-core 실행 중 오류가 발생했습니다:`), axeError);
      
      // 수동 접근성 검사 실행
      const manualResults = performManualAccessibilityCheck(document);
      const outputFile = path.join(options.output, `${path.basename(filePath, '.html')}-manual-a11y-report.html`);
      generateManualReport(manualResults, outputFile, filePath);
      
      return manualResults;
    }
  } catch (error) {
    console.error(chalk.red(`${filePath} 파일 검사 중 오류가 발생했습니다:`), error);
    return { violations: [], passes: [] };
  }
}

/**
 * 간단한 수동 접근성 검사 수행
 */
function performManualAccessibilityCheck(document) {
  console.log(chalk.yellow('axe-core 실행 실패로 인해 수동 접근성 검사를 수행합니다...'));
  
  const violations = [];
  const passes = [];
  
  // 이미지에 alt 속성 확인
  const images = document.querySelectorAll('img');
  let hasImageAltViolation = false;
  
  images.forEach((img, index) => {
    if (!img.hasAttribute('alt')) {
      hasImageAltViolation = true;
      violations.push({
        id: 'image-alt',
        impact: 'serious',
        help: '이미지에 대체 텍스트 제공',
        description: '모든 이미지는 적절한 대체 텍스트(alt 속성)를 가져야 합니다.',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/image-alt',
        nodes: [{
          html: img.outerHTML,
          target: [`img:nth-of-type(${index + 1})`],
          failureSummary: '이 이미지에 alt 속성을 추가하세요.'
        }]
      });
    }
  });
  
  if (images.length > 0 && !hasImageAltViolation) {
    passes.push({
      id: 'image-alt',
      description: '모든 이미지에 적절한 대체 텍스트가 제공됩니다.'
    });
  }
  
  // 버튼과 링크에 텍스트 확인
  const interactiveElements = [...document.querySelectorAll('a, button')];
  let hasLinkNameViolation = false;
  
  interactiveElements.forEach((element, index) => {
    if (element.textContent.trim() === '' && 
        (!element.hasAttribute('aria-label') && 
         !element.hasAttribute('aria-labelledby'))) {
      hasLinkNameViolation = true;
      violations.push({
        id: 'link-name',
        impact: 'serious',
        help: '링크와 버튼에 접근 가능한 이름 제공',
        description: '모든 링크와 버튼은 접근 가능한 이름을 가져야 합니다.',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/link-name',
        nodes: [{
          html: element.outerHTML,
          target: [`${element.tagName.toLowerCase()}:nth-of-type(${index + 1})`],
          failureSummary: '이 요소에 텍스트 내용이나 aria-label 속성을 추가하세요.'
        }]
      });
    }
  });
  
  if (interactiveElements.length > 0 && !hasLinkNameViolation) {
    passes.push({
      id: 'link-name',
      description: '모든 링크와 버튼에 접근 가능한 이름이 제공됩니다.'
    });
  }
  
  // 폼 레이블 확인
  const formControls = document.querySelectorAll('input, select, textarea');
  let hasLabelViolation = false;
  
  formControls.forEach((control, index) => {
    if (control.type !== 'hidden' && 
        control.type !== 'button' && 
        control.type !== 'submit' && 
        control.type !== 'reset' && 
        !control.hasAttribute('aria-label') && 
        !control.hasAttribute('aria-labelledby') &&
        !document.querySelector(`label[for="${control.id}"]`)) {
      hasLabelViolation = true;
      violations.push({
        id: 'label',
        impact: 'critical',
        help: '폼 요소에 레이블 제공',
        description: '모든 폼 요소는 접근 가능한 레이블을 가져야 합니다.',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/label',
        nodes: [{
          html: control.outerHTML,
          target: [`${control.tagName.toLowerCase()}:nth-of-type(${index + 1})`],
          failureSummary: '이 요소에 label 요소를 연결하거나 aria-label 속성을 추가하세요.'
        }]
      });
    }
  });
  
  if (formControls.length > 0 && !hasLabelViolation) {
    passes.push({
      id: 'label',
      description: '모든 폼 요소에 접근 가능한 레이블이 제공됩니다.'
    });
  }
  
  return {
    violations: violations,
    passes: passes
  };
}

/**
 * 수동 접근성 테스트 결과를 HTML 보고서로 생성하는 함수
 */
function generateManualReport(results, outputFile, sourceFile) {
  let htmlReport = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>수동 접근성 테스트 보고서 - ${path.basename(sourceFile)}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333; }
        h1 { color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        h2 { color: #3498db; margin-top: 30px; }
        .summary { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .violation { background: #ffecec; padding: 15px; margin: 10px 0; border-left: 5px solid #e74c3c; border-radius: 3px; }
        .impact-critical { border-left-color: #e74c3c; }
        .impact-serious { border-left-color: #e67e22; }
        .impact-moderate { border-left-color: #f1c40f; }
        .impact-minor { border-left-color: #3498db; }
        .node-info { background: #f5f5f5; padding: 10px; margin: 10px 0; font-family: monospace; white-space: pre-wrap; }
        .help-info { margin-top: 15px; }
        .help-info a { color: #3498db; text-decoration: none; }
        .help-info a:hover { text-decoration: underline; }
        .pass { color: green; }
        .warning { background-color: #fff3cd; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .timestamp { color: #777; font-size: 0.9em; margin-top: 50px; }
      </style>
    </head>
    <body>
      <h1>수동 접근성 테스트 보고서</h1>
      <p>소스 파일: ${sourceFile}</p>
      
      <div class="warning">
        <strong>참고:</strong> axe-core 실행 중 오류가 발생하여 제한된 수동 접근성 검사가 수행되었습니다.
        이 보고서는 완전한 접근성 분석이 아닐 수 있습니다.
      </div>
      
      <div class="summary">
        <h2>요약</h2>
        <p>테스트 시간: ${new Date().toLocaleString()}</p>
        <p>위반 항목: ${results.violations.length}개</p>
        <p>통과 항목: ${results.passes.length}개</p>
        <p>${results.violations.length === 0 ? 
          '<strong class="pass">검사한 항목에 대해 접근성 문제가 발견되지 않았습니다.</strong>' : 
          '<strong>접근성 이슈가 발견되었습니다. 아래 세부 정보를 확인하세요.</strong>'}
        </p>
      </div>
      
      <h2>위반 항목 상세</h2>
  `;

  if (results.violations.length === 0) {
    htmlReport += '<p>위반 항목이 없습니다.</p>';
  } else {
    results.violations.forEach(violation => {
      htmlReport += `
        <div class="violation impact-${violation.impact}">
          <h3>${violation.help} (중요도: ${violation.impact})</h3>
          <p>${violation.description}</p>
          <p>위반 규칙: ${violation.id}</p>
          
          <h4>영향받는 요소:</h4>
          ${violation.nodes.map(node => `
            <div class="node-info">
              <p>HTML: ${node.html}</p>
              <p>위치: ${node.target.join(', ')}</p>
              <p>해결 방법: ${node.failureSummary}</p>
            </div>
          `).join('')}
          
          <div class="help-info">
            <a href="${violation.helpUrl}" target="_blank">자세한 내용 보기</a>
          </div>
        </div>
      `;
    });
  }

  htmlReport += `
      <h2>통과된 항목</h2>
      <ul>
        ${results.passes.map(pass => `<li>${pass.id}: ${pass.description}</li>`).join('')}
      </ul>
      
      <div class="timestamp">
        생성 시간: ${new Date().toLocaleString()}
      </div>
    </body>
    </html>
  `;

  fs.writeFileSync(outputFile, htmlReport);
  console.log(chalk.green(`수동 접근성 보고서가 생성되었습니다: ${outputFile}`));
}

/**
 * 접근성 테스트 결과를 HTML 보고서로 생성하는 함수
 */
function generateReport(results, outputFile, sourceFile) {
  let htmlReport = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>접근성 테스트 보고서 - ${path.basename(sourceFile)}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333; }
        h1 { color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        h2 { color: #3498db; margin-top: 30px; }
        .summary { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .violation { background: #ffecec; padding: 15px; margin: 10px 0; border-left: 5px solid #e74c3c; border-radius: 3px; }
        .impact-critical { border-left-color: #e74c3c; }
        .impact-serious { border-left-color: #e67e22; }
        .impact-moderate { border-left-color: #f1c40f; }
        .impact-minor { border-left-color: #3498db; }
        .node-info { background: #f5f5f5; padding: 10px; margin: 10px 0; font-family: monospace; white-space: pre-wrap; }
        .help-info { margin-top: 15px; }
        .help-info a { color: #3498db; text-decoration: none; }
        .help-info a:hover { text-decoration: underline; }
        .pass { color: green; }
        .timestamp { color: #777; font-size: 0.9em; margin-top: 50px; }
      </style>
    </head>
    <body>
      <h1>접근성 테스트 보고서</h1>
      <p>소스 파일: ${sourceFile}</p>
      
      <div class="summary">
        <h2>요약</h2>
        <p>테스트 시간: ${new Date().toLocaleString()}</p>
        <p>위반 항목: ${results.violations.length}개</p>
        <p>통과 항목: ${results.passes.length}개</p>
        <p>${results.violations.length === 0 ? 
          '<strong class="pass">모든 접근성 테스트를 통과했습니다!</strong>' : 
          '<strong>접근성 이슈가 발견되었습니다. 아래 세부 정보를 확인하세요.</strong>'}
        </p>
      </div>
      
      <h2>위반 항목 상세</h2>
  `;

  if (results.violations.length === 0) {
    htmlReport += '<p>위반 항목이 없습니다.</p>';
  } else {
    results.violations.forEach(violation => {
      htmlReport += `
        <div class="violation impact-${violation.impact}">
          <h3>${violation.help} (중요도: ${violation.impact})</h3>
          <p>${violation.description}</p>
          <p>위반 규칙: ${violation.id}</p>
          
          <h4>영향받는 요소:</h4>
          ${violation.nodes.map(node => `
            <div class="node-info">
              <p>HTML: ${node.html}</p>
              <p>위치: ${node.target.join(', ')}</p>
              <p>해결 방법: ${node.failureSummary}</p>
            </div>
          `).join('')}
          
          <div class="help-info">
            <a href="${violation.helpUrl}" target="_blank">자세한 내용 보기</a>
          </div>
        </div>
      `;
    });
  }

  htmlReport += `
      <h2>통과된 항목</h2>
      <ul>
        ${results.passes.map(pass => `<li>${pass.id}: ${pass.description}</li>`).join('')}
      </ul>
      
      <div class="timestamp">
        생성 시간: ${new Date().toLocaleString()}
      </div>
    </body>
    </html>
  `;

  fs.writeFileSync(outputFile, htmlReport);
  console.log(chalk.green(`보고서가 생성되었습니다: ${outputFile}`));
}

// 모든 HTML 파일 검사
async function runTests() {
  let totalViolations = 0;
  
  for (const file of htmlFiles) {
    const results = await testHtmlFile(file);
    if (results) {
      totalViolations += results.violations.length;
    }
  }
  
  console.log(chalk.blue('\n테스트 완료 요약:'));
  console.log(`  검사한 파일: ${chalk.blue(htmlFiles.length)}개`);
  console.log(`  총 위반 항목: ${chalk.red(totalViolations)}개`);
  console.log(chalk.green(`\n보고서 위치: ${options.output}`));
}

// 테스트 실행
runTests(); 