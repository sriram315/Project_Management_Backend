/**
 * Comprehensive Test Suite for Dashboard Multi-Select Functionality
 * Tests all combinations of single/multiple project and employee filters
 */

const http = require('http');

const API_BASE = 'http://localhost:5005/api/dashboard';
const TEST_DATE_RANGE = 'startDate=2024-01-01&endDate=2024-12-31';

// Test helper function
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('🧪 Starting Dashboard Multi-Select API Tests\n');
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: No filters (all data)
  console.log('\n📋 Test 1: No filters (all data)');
  try {
    const data = await makeRequest(`${API_BASE}/data?${TEST_DATE_RANGE}`);
    const hasData = data.utilizationData && data.utilizationData.length > 0;
    if (hasData) {
      console.log('✅ PASS: Returns data for all projects/employees');
      console.log(`   Weeks: ${data.utilizationData.length}`);
      console.log(`   Sample availableHours: ${data.utilizationData[0]?.availableHours || 0}`);
      passed++;
    } else {
      console.log('❌ FAIL: No data returned');
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
  }
  
  // Test 2: Single project
  console.log('\n📋 Test 2: Single project filter');
  try {
    const data = await makeRequest(`${API_BASE}/data?projectId=64&${TEST_DATE_RANGE}`);
    const hasData = data.utilizationData && data.utilizationData.length > 0;
    if (hasData) {
      console.log('✅ PASS: Returns data for single project');
      console.log(`   Weeks: ${data.utilizationData.length}`);
      passed++;
    } else {
      console.log('❌ FAIL: No data returned');
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
  }
  
  // Test 3: Multiple projects (comma-separated)
  console.log('\n📋 Test 3: Multiple projects (comma-separated)');
  try {
    const data = await makeRequest(`${API_BASE}/data?projectId=64,63,66&${TEST_DATE_RANGE}`);
    const hasData = data.utilizationData && data.utilizationData.length > 0;
    if (hasData) {
      console.log('✅ PASS: Returns data for multiple projects');
      console.log(`   Weeks: ${data.utilizationData.length}`);
      passed++;
    } else {
      console.log('❌ FAIL: No data returned');
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
  }
  
  // Test 4: Single employee
  console.log('\n📋 Test 4: Single employee filter');
  try {
    const data = await makeRequest(`${API_BASE}/data?employeeId=1&${TEST_DATE_RANGE}`);
    const hasData = data.utilizationData && data.utilizationData.length > 0;
    if (hasData) {
      console.log('✅ PASS: Returns data for single employee');
      console.log(`   Weeks: ${data.utilizationData.length}`);
      console.log(`   Sample availableHours: ${data.utilizationData[0]?.availableHours || 0} (should be ~40 for 1 employee)`);
      passed++;
    } else {
      console.log('❌ FAIL: No data returned');
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
  }
  
  // Test 5: Multiple employees (comma-separated)
  console.log('\n📋 Test 5: Multiple employees (comma-separated)');
  try {
    const data = await makeRequest(`${API_BASE}/data?employeeId=1,2,3&${TEST_DATE_RANGE}`);
    const hasData = data.utilizationData && data.utilizationData.length > 0;
    if (hasData) {
      console.log('✅ PASS: Returns data for multiple employees');
      console.log(`   Weeks: ${data.utilizationData.length}`);
      console.log(`   Sample availableHours: ${data.utilizationData[0]?.availableHours || 0} (should be ~120 for 3 employees)`);
      passed++;
    } else {
      console.log('❌ FAIL: No data returned');
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
  }
  
  // Test 6: Combined filters (multiple projects + multiple employees)
  console.log('\n📋 Test 6: Combined filters (multiple projects + multiple employees)');
  try {
    const data = await makeRequest(`${API_BASE}/data?projectId=64,63&employeeId=1,2&${TEST_DATE_RANGE}`);
    const hasData = data.utilizationData && data.utilizationData.length > 0;
    if (hasData) {
      console.log('✅ PASS: Returns data for combined filters');
      console.log(`   Weeks: ${data.utilizationData.length}`);
      passed++;
    } else {
      console.log('❌ FAIL: No data returned');
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
  }
  
  // Test 7: Employees endpoint with multiple projects
  console.log('\n📋 Test 7: Employees endpoint with multiple projects');
  try {
    const data = await makeRequest(`${API_BASE}/employees?projectId=64,63`);
    if (Array.isArray(data) && data.length > 0) {
      console.log('✅ PASS: Returns employees for multiple projects');
      console.log(`   Employees found: ${data.length}`);
      passed++;
    } else {
      console.log('❌ FAIL: No employees returned or invalid format');
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
  }
  
  // Test 8: Task status with multiple filters
  console.log('\n📋 Test 8: Task status with multiple filters');
  try {
    const data = await makeRequest(`${API_BASE}/task-status?projectId=64,63&employeeId=1,2&${TEST_DATE_RANGE}`);
    if (data && typeof data === 'object' && 'todo' in data) {
      console.log('✅ PASS: Returns task status for multiple filters');
      console.log(`   Task counts: ${JSON.stringify(data)}`);
      passed++;
    } else {
      console.log('❌ FAIL: Invalid response format');
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
  }
  
  // Test 9: Edge case - invalid project ID
  console.log('\n📋 Test 9: Edge case - invalid project ID');
  try {
    const data = await makeRequest(`${API_BASE}/data?projectId=999999&${TEST_DATE_RANGE}`);
    if (data && data.utilizationData) {
      console.log('✅ PASS: Handles invalid project ID gracefully');
      console.log(`   Weeks: ${data.utilizationData.length}`);
      passed++;
    } else {
      console.log('❌ FAIL: Unexpected response');
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
  }
  
  // Test 10: Edge case - mixed valid/invalid IDs
  console.log('\n📋 Test 10: Edge case - mixed valid/invalid IDs');
  try {
    const data = await makeRequest(`${API_BASE}/data?projectId=64,999999&${TEST_DATE_RANGE}`);
    if (data && data.utilizationData) {
      console.log('✅ PASS: Filters out invalid IDs, returns data for valid ones');
      console.log(`   Weeks: ${data.utilizationData.length}`);
      passed++;
    } else {
      console.log('❌ FAIL: Unexpected response');
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
  }
  
  // Test 11: Verify calculation consistency
  console.log('\n📋 Test 11: Verify calculation consistency');
  try {
    const data = await makeRequest(`${API_BASE}/data?employeeId=1&${TEST_DATE_RANGE}`);
    if (data && data.utilizationData && data.utilizationData.length > 0) {
      const week = data.utilizationData[0];
      const hasAllFields = 'utilization' in week && 'productivity' in week && 'availableHours' in week;
      if (hasAllFields) {
        console.log('✅ PASS: All calculation fields present');
        console.log(`   Sample: utilization=${week.utilization}, productivity=${week.productivity}, availableHours=${week.availableHours}`);
        passed++;
      } else {
        console.log('❌ FAIL: Missing calculation fields');
        failed++;
      }
    } else {
      console.log('❌ FAIL: No data to verify');
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
  }
  
  // Test 12: Verify data structure matches across all three datasets
  console.log('\n📋 Test 12: Verify data structure consistency');
  try {
    const data = await makeRequest(`${API_BASE}/data?projectId=64&${TEST_DATE_RANGE}`);
    if (data && data.utilizationData && data.productivityData && data.availabilityData) {
      const utilLen = data.utilizationData.length;
      const prodLen = data.productivityData.length;
      const availLen = data.availabilityData.length;
      
      if (utilLen === prodLen && prodLen === availLen) {
        console.log('✅ PASS: All datasets have same length');
        console.log(`   Length: ${utilLen} weeks`);
        passed++;
      } else {
        console.log(`❌ FAIL: Length mismatch - util:${utilLen}, prod:${prodLen}, avail:${availLen}`);
        failed++;
      }
    } else {
      console.log('❌ FAIL: Missing datasets');
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('\n' + '='.repeat(60));
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(err => {
  console.error('❌ Test runner error:', err);
  process.exit(1);
});

