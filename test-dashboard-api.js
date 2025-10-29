// Using built-in fetch in Node.js 20+

// Test cases with expected results calculated manually from database
const testCases = [
    {
        name: "No Filters - All Data",
        filters: {},
        expectedUtilization: 39.2,
        expectedCompleted: 2,
        expectedHours: 51,
        expectedAvailableHours: 255,
        expectedTaskStatus: { todo: 2, in_progress: 1, completed: 2, blocked: 1 }
    },
    {
        name: "Date Range Filter - 2025-10-07 to 2025-10-28",
        filters: { startDate: '2025-10-07', endDate: '2025-10-28' },
        expectedUtilization: 39.2,
        expectedCompleted: 2,
        expectedHours: 51,
        expectedAvailableHours: 255,
        expectedTaskStatus: { todo: 2, in_progress: 1, completed: 2, blocked: 1 }
    },
    {
        name: "Project Filter - Project 31 (E-Commerce Platform)",
        filters: { projectId: '31' },
        expectedUtilization: 23.1,
        expectedCompleted: 1,
        expectedHours: 12,
        expectedAvailableHours: 130,
        expectedTaskStatus: { todo: 1, in_progress: 0, completed: 1, blocked: 1 }
    },
    {
        name: "Project Filter - Project 32 (Banking System)",
        filters: { projectId: '32' },
        expectedUtilization: 56.0,
        expectedCompleted: 1,
        expectedHours: 39,
        expectedAvailableHours: 125,
        expectedTaskStatus: { todo: 1, in_progress: 1, completed: 1, blocked: 0 }
    },
    {
        name: "Employee Filter - Employee 1 (john.manager)",
        filters: { employeeId: '1' },
        expectedUtilization: 44.4,
        expectedCompleted: 1,
        expectedHours: 12,
        expectedAvailableHours: 135,
        expectedTaskStatus: { todo: 1, in_progress: 0, completed: 1, blocked: 1 }
    },
    {
        name: "Employee Filter - Employee 2 (sarah.lead)",
        filters: { employeeId: '2' },
        expectedUtilization: 35.0,
        expectedCompleted: 0,
        expectedHours: 25,
        expectedAvailableHours: 80,
        expectedTaskStatus: { todo: 1, in_progress: 1, completed: 0, blocked: 0 }
    },
    {
        name: "Combined Filter - Project 31 + Employee 1",
        filters: { projectId: '31', employeeId: '1' },
        expectedUtilization: 24.4,
        expectedCompleted: 1,
        expectedHours: 12,
        expectedAvailableHours: 90,
        expectedTaskStatus: { todo: 0, in_progress: 0, completed: 1, blocked: 1 }
    },
    {
        name: "Combined Filter - Project 32 + Date Range",
        filters: { projectId: '32', startDate: '2025-10-07', endDate: '2025-10-28' },
        expectedUtilization: 56.0,
        expectedCompleted: 1,
        expectedHours: 39,
        expectedAvailableHours: 125,
        expectedTaskStatus: { todo: 1, in_progress: 1, completed: 1, blocked: 0 }
    },
    {
        name: "Combined Filter - Employee 1 + Date Range",
        filters: { employeeId: '1', startDate: '2025-10-07', endDate: '2025-10-28' },
        expectedUtilization: 44.4,
        expectedCompleted: 1,
        expectedHours: 12,
        expectedAvailableHours: 135,
        expectedTaskStatus: { todo: 1, in_progress: 0, completed: 1, blocked: 1 }
    },
    {
        name: "All Filters Combined - Project 31 + Employee 1 + Date Range",
        filters: { projectId: '31', employeeId: '1', startDate: '2025-10-07', endDate: '2025-10-28' },
        expectedUtilization: 24.4,
        expectedCompleted: 1,
        expectedHours: 12,
        expectedAvailableHours: 90,
        expectedTaskStatus: { todo: 0, in_progress: 0, completed: 1, blocked: 1 }
    }
];

// Function to test API endpoint
async function testAPIEndpoint(filters) {
    const queryParams = new URLSearchParams();
    
    if (filters.projectId) queryParams.append('projectId', filters.projectId);
    if (filters.employeeId) queryParams.append('employeeId', filters.employeeId);
    if (filters.startDate) queryParams.append('startDate', filters.startDate);
    if (filters.endDate) queryParams.append('endDate', filters.endDate);
    
    const url = `http://localhost:5000/api/dashboard/data?${queryParams.toString()}`;
    const taskStatusUrl = `http://localhost:5000/api/dashboard/task-status?${queryParams.toString()}`;
    
    try {
        const [dashboardResponse, taskStatusResponse] = await Promise.all([
            fetch(url),
            fetch(taskStatusUrl)
        ]);
        
        const dashboardData = await dashboardResponse.json();
        const taskStatusData = await taskStatusResponse.json();
        
        return {
            dashboardData,
            taskStatusData
        };
    } catch (error) {
        console.error('API Test Error:', error);
        return null;
    }
}

// Function to compare results
function compareResults(expected, actual, testName) {
    console.log(`\n🧪 Testing: ${testName}`);
    console.log('=' .repeat(60));
    
    let allPassed = true;
    
    if (actual.dashboardData.utilizationData.length > 0) {
        const actualData = actual.dashboardData.utilizationData[0];
        
        // Test utilization
        const utilizationMatch = Math.abs(expected.expectedUtilization - actualData.utilization) < 0.1;
        console.log(`✅ Utilization: Expected ${expected.expectedUtilization}%, Got ${actualData.utilization}% ${utilizationMatch ? '✅' : '❌'}`);
        if (!utilizationMatch) allPassed = false;
        
        // Test completed tasks
        const completedMatch = expected.expectedCompleted === actualData.completed;
        console.log(`✅ Completed Tasks: Expected ${expected.expectedCompleted}, Got ${actualData.completed} ${completedMatch ? '✅' : '❌'}`);
        if (!completedMatch) allPassed = false;
        
        // Test hours
        const hoursMatch = Math.abs(expected.expectedHours - actualData.hours) < 0.1;
        console.log(`✅ Hours: Expected ${expected.expectedHours}, Got ${actualData.hours} ${hoursMatch ? '✅' : '❌'}`);
        if (!hoursMatch) allPassed = false;
        
        // Test available hours
        const availableMatch = expected.expectedAvailableHours === actualData.availableHours;
        console.log(`✅ Available Hours: Expected ${expected.expectedAvailableHours}, Got ${actualData.availableHours} ${availableMatch ? '✅' : '❌'}`);
        if (!availableMatch) allPassed = false;
    } else {
        console.log(`❌ No data returned for ${testName}`);
        allPassed = false;
    }
    
    // Test task status
    const taskStatusMatch = JSON.stringify(expected.expectedTaskStatus) === JSON.stringify(actual.taskStatusData);
    console.log(`✅ Task Status: Expected ${JSON.stringify(expected.expectedTaskStatus)}, Got ${JSON.stringify(actual.taskStatusData)} ${taskStatusMatch ? '✅' : '❌'}`);
    if (!taskStatusMatch) allPassed = false;
    
    console.log(`\n${allPassed ? '🎉 ALL TESTS PASSED!' : '❌ SOME TESTS FAILED!'}`);
    return allPassed;
}

// Main test function
async function runAllTests() {
    console.log('🚀 Starting Dashboard API Test Suite');
    console.log('=' .repeat(60));
    
    let totalTests = 0;
    let passedTests = 0;
    
    for (const testCase of testCases) {
        totalTests++;
        
        try {
            // Test API endpoint
            const actual = await testAPIEndpoint(testCase.filters);
            
            if (actual) {
                const passed = compareResults(testCase, actual, testCase.name);
                if (passed) passedTests++;
            } else {
                console.log(`❌ API Test Failed: ${testCase.name}`);
            }
            
        } catch (error) {
            console.error(`❌ Test Error: ${testCase.name}`, error.message);
        }
        
        // Wait a bit between tests
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log(`📊 TEST SUMMARY: ${passedTests}/${totalTests} tests passed`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
        console.log('🎉 ALL TESTS PASSED! Dashboard API is working perfectly!');
    } else {
        console.log('❌ Some tests failed. Please check the issues above.');
    }
}

// Run the tests
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = {
    testCases,
    testAPIEndpoint,
    compareResults,
    runAllTests
};
