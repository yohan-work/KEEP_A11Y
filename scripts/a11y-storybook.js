#!/usr/bin/env node

/**
 * 스토리북 컴포넌트의 접근성 테스트를 수행하는 도구
 * 
 * 이 스크립트는 다음과 같은 단계로 작동합니다:
 * 1. 스토리북을 빌드하여 정적 HTML 파일 생성
 * 2. 생성된 HTML 파일을 axe-core로 접근성 검사
 * 3. 결과를 HTML 보고서로 생성
 * 
 * 사용법:
 * npm run a11y:storybook
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import glob from 'glob';
import chalk from 'chalk';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const STORYBOOK_BUILD_DIR = 'storybook-static';
const OUTPUT_DIR = 'a11y-reports/storybook';

// 로그 출력 함수
function log(message, type = 'info') {
  const logTypes = {
    info: chalk.blue,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red
  };
  
  console.log(logTypes[type](`[${type.toUpperCase()}] ${message}`));
}

// 출력 디렉토리 생성
function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`디렉토리를 생성했습니다: ${dir}`, 'success');
  }
}

// 스토리북 빌드
async function buildStorybook() {
  log('스토리북 빌드를 시작합니다...');
  
  try {
    execSync('npm run build-storybook', { stdio: 'inherit' });
    log('스토리북 빌드가 완료되었습니다.', 'success');
    return true;
  } catch (error) {
    log('스토리북 빌드 중 오류가 발생했습니다.', 'error');
    console.error(error);
    return false;
  }
}

// HTML 파일 접근성 검사
async function testHtmlFile(filePath) {
  log(`${filePath} 파일을 검사합니다...`);
  
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      resources: 'usable'
    });
    
    // Axe needs a global window/document object
    global.window = dom.window;
    global.document = dom.window.document;
    
    // axe 실행
    const results = await axe.run(dom.window.document);
    
    // 글로벌 삭제
    delete global.window;
    delete global.document;
    
    // 결과 저장
    const relativePath = path.relative(STORYBOOK_BUILD_DIR, filePath);
    const outputFile = path.join(OUTPUT_DIR, `${relativePath.replace(/\//g, '-')}-a11y-report.html`);
    generateReport(results, outputFile, filePath);
    
    // 결과 출력
    log(`검사 완료: ${relativePath}`, 'success');
    log(`  위반 항목: ${results.violations.length}개`, results.violations.length > 0 ? 'warning' : 'success');
    log(`  통과 항목: ${results.passes.length}개`, 'info');
    
    // 위반 항목이 있으면 간단히 출력
    if (results.violations.length > 0) {
      log('주요 위반 항목:', 'warning');
      results.violations.forEach((violation, index) => {
        console.log(`  ${index + 1}. ${chalk.red(violation.id)}: ${violation.help} (중요도: ${violation.impact})`);
      });
    }
    
    return results;
  } catch (error) {
    log(`${filePath} 파일 검사 중 오류가 발생했습니다:`, 'error');
    console.error(error);
    return null;
  }
}

// 접근성 테스트 결과를 HTML 보고서로 생성
function generateReport(results, outputFile, sourceFile) {
  ensureDirectoryExists(path.dirname(outputFile));
  
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
  log(`보고서가 생성되었습니다: ${outputFile}`, 'success');
}

// 종합 보고서 생성
function generateSummaryReport(results, outputFile) {
  ensureDirectoryExists(path.dirname(outputFile));
  
  // 결과 요약
  const totalFiles = results.length;
  const filesWithViolations = results.filter(r => r.violations.length > 0).length;
  const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
  const totalPasses = results.reduce((sum, r) => sum + r.passes.length, 0);
  
  // 위반 항목 통계
  const violationStats = {};
  results.forEach(result => {
    result.violations.forEach(violation => {
      if (!violationStats[violation.id]) {
        violationStats[violation.id] = {
          id: violation.id,
          description: violation.description,
          help: violation.help,
          count: 0,
          impact: violation.impact,
          helpUrl: violation.helpUrl
        };
      }
      violationStats[violation.id].count += violation.nodes.length;
    });
  });
  
  // 영향도별 분류
  const impactLevels = ['critical', 'serious', 'moderate', 'minor'];
  const violationsByImpact = {};
  impactLevels.forEach(level => {
    violationsByImpact[level] = Object.values(violationStats).filter(v => v.impact === level);
  });
  
  // HTML 보고서 생성
  let htmlReport = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>접근성 테스트 종합 보고서</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333; }
        h1 { color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        h2 { color: #3498db; margin-top: 30px; }
        h3 { color: #2c3e50; margin-top: 25px; }
        .summary { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .files-list { max-height: 300px; overflow-y: auto; border: 1px solid #eee; padding: 10px; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #f2f2f2; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .impact-critical { background-color: #ffdddd; }
        .impact-serious { background-color: #ffe8cc; }
        .impact-moderate { background-color: #fffbcc; }
        .impact-minor { background-color: #e6f5ff; }
        .impact-legend { display: flex; margin: 20px 0; }
        .impact-legend > div { margin-right: 20px; padding: 5px 10px; border-radius: 3px; }
        .pass { color: green; }
        .fail { color: red; }
        .timestamp { color: #777; font-size: 0.9em; margin-top: 50px; }
      </style>
    </head>
    <body>
      <h1>접근성 테스트 종합 보고서</h1>
      
      <div class="summary">
        <h2>요약</h2>
        <p>테스트 시간: ${new Date().toLocaleString()}</p>
        <p>검사한 파일: ${totalFiles}개</p>
        <p>접근성 이슈가 있는 파일: ${filesWithViolations}개</p>
        <p>총 위반 항목: ${totalViolations}개</p>
        <p>총 통과 항목: ${totalPasses}개</p>
        <p>${totalViolations === 0 ? 
          '<strong class="pass">모든 접근성 테스트를 통과했습니다!</strong>' : 
          '<strong class="fail">접근성 이슈가 발견되었습니다. 아래 세부 정보를 확인하세요.</strong>'}
        </p>
      </div>
      
      <h2>심각도별 이슈</h2>
      <div class="impact-legend">
        <div class="impact-critical">심각: ${violationsByImpact.critical.length}개 규칙, ${
          violationsByImpact.critical.reduce((sum, v) => sum + v.count, 0)
        }개 요소</div>
        <div class="impact-serious">주의: ${violationsByImpact.serious.length}개 규칙, ${
          violationsByImpact.serious.reduce((sum, v) => sum + v.count, 0)
        }개 요소</div>
        <div class="impact-moderate">중간: ${violationsByImpact.moderate.length}개 규칙, ${
          violationsByImpact.moderate.reduce((sum, v) => sum + v.count, 0)
        }개 요소</div>
        <div class="impact-minor">경미: ${violationsByImpact.minor.length}개 규칙, ${
          violationsByImpact.minor.reduce((sum, v) => sum + v.count, 0)
        }개 요소</div>
      </div>
      
      <h2>위반 규칙 목록</h2>
  `;
  
  impactLevels.forEach(impact => {
    if (violationsByImpact[impact].length > 0) {
      const impactLabel = {
        critical: '심각', 
        serious: '주의', 
        moderate: '중간', 
        minor: '경미'
      }[impact];
      
      htmlReport += `
        <h3>${impactLabel} 수준 이슈 (${violationsByImpact[impact].length}개)</h3>
        <table>
          <tr>
            <th>규칙 ID</th>
            <th>설명</th>
            <th>발생 횟수</th>
            <th>자세히</th>
          </tr>
      `;
      
      violationsByImpact[impact].forEach(violation => {
        htmlReport += `
          <tr class="impact-${impact}">
            <td>${violation.id}</td>
            <td>${violation.help}</td>
            <td>${violation.count}</td>
            <td><a href="${violation.helpUrl}" target="_blank">상세 정보</a></td>
          </tr>
        `;
      });
      
      htmlReport += `</table>`;
    }
  });
  
  // 검사한 파일 목록
  htmlReport += `
    <h2>검사한 파일 목록 (${totalFiles}개)</h2>
    <div class="files-list">
      <table>
        <tr>
          <th>파일</th>
          <th>위반 항목</th>
          <th>통과 항목</th>
          <th>보고서</th>
        </tr>
  `;
  
  results.forEach(result => {
    htmlReport += `
      <tr>
        <td>${result.filePath}</td>
        <td class="${result.violations.length > 0 ? 'fail' : 'pass'}">${result.violations.length}개</td>
        <td>${result.passes.length}개</td>
        <td><a href="${result.reportPath}" target="_blank">보고서 보기</a></td>
      </tr>
    `;
  });
  
  htmlReport += `
      </table>
    </div>
    
    <div class="timestamp">
      생성 시간: ${new Date().toLocaleString()}
    </div>
  </body>
  </html>
  `;
  
  fs.writeFileSync(outputFile, htmlReport);
  log(`종합 보고서가 생성되었습니다: ${outputFile}`, 'success');
}

// 메인 함수
async function main() {
  // 출력 디렉토리 확인
  ensureDirectoryExists(OUTPUT_DIR);
  
  // 스토리북 빌드
  const buildSuccess = await buildStorybook();
  if (!buildSuccess) {
    log('스토리북 빌드가 실패했습니다. 접근성 테스트를 진행할 수 없습니다.', 'error');
    return;
  }
  
  // HTML 파일 찾기
  log(`${STORYBOOK_BUILD_DIR} 디렉토리에서 HTML 파일을 검색합니다...`);
  const htmlFiles = glob.sync(`${STORYBOOK_BUILD_DIR}/**/*.html`);
  log(`${htmlFiles.length}개의 HTML 파일을 찾았습니다.`);
  
  // 각 파일 검사
  const testResults = [];
  for (const file of htmlFiles) {
    const result = await testHtmlFile(file);
    if (result) {
      const relativePath = path.relative(STORYBOOK_BUILD_DIR, file);
      const reportPath = path.join(OUTPUT_DIR, `${relativePath.replace(/\//g, '-')}-a11y-report.html`);
      
      testResults.push({
        filePath: file,
        violations: result.violations,
        passes: result.passes,
        reportPath: reportPath
      });
    }
  }
  
  // 종합 보고서 생성
  log('종합 보고서를 생성합니다...');
  generateSummaryReport(testResults, path.join(OUTPUT_DIR, 'summary.html'));
  
  // 완료 메시지
  log(`접근성 테스트가 완료되었습니다. 총 ${testResults.length}개 파일 검사 완료.`, 'success');
  const totalViolations = testResults.reduce((sum, r) => sum + r.violations.length, 0);
  if (totalViolations === 0) {
    log('모든 파일이 접근성 테스트를 통과했습니다! 👍', 'success');
  } else {
    log(`총 ${totalViolations}개의 접근성 문제가 발견되었습니다.`, 'warning');
    log(`종합 보고서: ${path.join(OUTPUT_DIR, 'summary.html')}`, 'info');
  }
}

// 스크립트 실행
main().catch(error => {
  log('스크립트 실행 중 오류가 발생했습니다:', 'error');
  console.error(error);
}); 