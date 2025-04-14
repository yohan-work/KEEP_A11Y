#!/usr/bin/env node

/**
 * 매우 간단한 접근성 테스트 도구
 * 이 스크립트는 jsdom과 axe-core를 사용하여 HTML 파일의 접근성을 테스트합니다.
 * 
 * 사용법:
 * node scripts/simple-a11y.js [HTML 파일 경로]
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const axeCore = require('axe-core');

// 명령행 인수 파싱
const filePath = process.argv[2];

if (!filePath) {
  console.error('HTML 파일 경로를 지정해 주세요.');
  console.error('사용법: node scripts/simple-a11y.js [HTML 파일 경로]');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`파일을 찾을 수 없습니다: ${filePath}`);
  process.exit(1);
}

// 출력 디렉토리 생성
const outputDir = './a11y-reports';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// HTML 파일 분석
async function analyzeFile() {
  console.log(`${filePath} 파일을 분석합니다...`);
  
  try {
    // HTML 파일 읽기
    const html = fs.readFileSync(filePath, 'utf8');
    
    // JSDOM으로 파싱
    const dom = new JSDOM(html);
    
    // axe 실행
    const results = await axeCore.run(dom.window.document);
    
    // 결과 출력
    console.log(`\n접근성 검사 결과:`);
    console.log(`- 위반 항목: ${results.violations.length}개`);
    console.log(`- 통과 항목: ${results.passes.length}개`);
    
    // 위반 항목 상세 출력
    if (results.violations.length > 0) {
      console.log('\n위반 항목 상세:');
      results.violations.forEach((violation, index) => {
        console.log(`\n${index + 1}. ${violation.id}: ${violation.help}`);
        console.log(`   심각도: ${violation.impact}`);
        console.log(`   설명: ${violation.description}`);
        console.log(`   도움말: ${violation.helpUrl}`);
        console.log('   영향받는 요소:');
        violation.nodes.forEach((node, nodeIndex) => {
          console.log(`     ${nodeIndex + 1}. ${node.html}`);
          console.log(`        해결 방법: ${node.failureSummary}`);
        });
      });
    }
    
    // HTML 보고서 생성
    const outputFile = path.join(outputDir, `${path.basename(filePath, '.html')}-a11y-report.html`);
    generateReport(results, outputFile);
    
    return results;
  } catch (error) {
    console.error('분석 중 오류가 발생했습니다:', error);
    process.exit(1);
  }
}

// HTML 보고서 생성
function generateReport(results, outputFile) {
  let htmlReport = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>접근성 테스트 보고서 - ${path.basename(filePath)}</title>
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
      <p>소스 파일: ${filePath}</p>
      
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
  console.log(`\n보고서가 생성되었습니다: ${outputFile}`);
}

// 분석 실행
analyzeFile(); 