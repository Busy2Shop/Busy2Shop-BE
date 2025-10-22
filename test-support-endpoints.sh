#!/bin/bash

# Support Ticket System Test Script
# This script tests all support ticket endpoints

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:8088"
ADMIN_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdXRoS2V5IjoiZW1tYTIyMTk5OUBnbWFpbC5jb20iLCJ0b2tlblR5cGUiOiJhZG1pbiIsImlhdCI6MTc2MDY2NDg2MywiZXhwIjoxNzYxMjY5NjYzfQ.4fxEVSgruBnys5C36W5KwbtwaU6yssqx315Eh-crRPc"
LOG_FILE="/tmp/support-ticket-test-$(date +%Y%m%d_%H%M%S).log"

echo -e "${YELLOW}======================================${NC}"
echo -e "${YELLOW}Support Ticket System Test${NC}"
echo -e "${YELLOW}======================================${NC}"
echo ""
echo -e "Logging to: ${LOG_FILE}"
echo ""

# Function to log and display
log_test() {
    echo -e "$1" | tee -a "${LOG_FILE}"
}

# Function to run test
run_test() {
    local test_name="$1"
    local curl_cmd="$2"

    log_test "${YELLOW}Testing: ${test_name}${NC}"

    response=$(eval "$curl_cmd" 2>&1)
    echo "$response" >> "${LOG_FILE}"

    if echo "$response" | grep -q '"status":"success"'; then
        log_test "${GREEN}✓ PASS${NC}\n"
        echo "$response" | grep -o '"data":{[^}]*}' | head -1
        return 0
    elif echo "$response" | grep -q '"status":"error"'; then
        error_msg=$(echo "$response" | grep -o '"message":"[^"]*"' | head -1)
        log_test "${RED}✗ FAIL: $error_msg${NC}\n"
        return 1
    else
        log_test "${RED}✗ FAIL: Unexpected response${NC}\n"
        return 1
    fi
}

# Test 1: Create Guest Ticket
log_test "\n${YELLOW}=== Test 1: Create Guest Support Ticket ===${NC}"
TICKET_ID=$(run_test "Create Guest Ticket" \
    "curl -s -X POST '${BASE_URL}/api/v0/support/tickets' \
    -H 'Content-Type: application/json' \
    -d '{
        \"name\": \"Test Customer\",
        \"email\": \"customer@test.com\",
        \"phone\": \"+2349012345678\",
        \"subject\": \"Test Ticket - Automated\",
        \"message\": \"This is an automated test ticket.\",
        \"type\": \"Support-Request\",
        \"category\": \"technical\",
        \"priority\": \"medium\"
    }'" | grep -o '"ticketId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TICKET_ID" ]; then
    TICKET_ID="42b45010-dc83-4e62-8905-855b363ada82"  # Fallback to existing ticket
    log_test "${YELLOW}Using existing ticket ID: $TICKET_ID${NC}\n"
fi

# Test 2: Admin - Get Ticket Stats
log_test "\n${YELLOW}=== Test 2: Get Ticket Statistics ===${NC}"
run_test "Get Ticket Stats" \
    "curl -s '${BASE_URL}/api/v0/admin/support/stats' \
    -H 'Authorization: Bearer ${ADMIN_TOKEN}'"

# Test 3: Admin - Get All Tickets
log_test "\n${YELLOW}=== Test 3: Get All Tickets ===${NC}"
run_test "Get All Tickets" \
    "curl -s '${BASE_URL}/api/v0/admin/support/tickets?page=1&perPage=10' \
    -H 'Authorization: Bearer ${ADMIN_TOKEN}'"

# Test 4: Admin - Get Ticket By ID
log_test "\n${YELLOW}=== Test 4: Get Ticket By ID ===${NC}"
run_test "Get Ticket By ID" \
    "curl -s '${BASE_URL}/api/v0/admin/support/tickets/${TICKET_ID}' \
    -H 'Authorization: Bearer ${ADMIN_TOKEN}'"

# Test 5: Admin - Update Ticket Status
log_test "\n${YELLOW}=== Test 5: Update Ticket Status ===${NC}"
run_test "Update Ticket Status to In Progress" \
    "curl -s -X PATCH '${BASE_URL}/api/v0/admin/support/tickets/${TICKET_ID}/status' \
    -H 'Authorization: Bearer ${ADMIN_TOKEN}' \
    -H 'Content-Type: application/json' \
    -d '{\"state\": \"In Progress\"}'"

# Test 6: Admin - Update Ticket Priority
log_test "\n${YELLOW}=== Test 6: Update Ticket Priority ===${NC}"
run_test "Update Ticket Priority to High" \
    "curl -s -X PATCH '${BASE_URL}/api/v0/admin/support/tickets/${TICKET_ID}/priority' \
    -H 'Authorization: Bearer ${ADMIN_TOKEN}' \
    -H 'Content-Type: application/json' \
    -d '{\"priority\": \"high\"}'"

# Test 7: Admin - Add Response
log_test "\n${YELLOW}=== Test 7: Add Admin Response ===${NC}"
run_test "Add Admin Response" \
    "curl -s -X POST '${BASE_URL}/api/v0/admin/support/tickets/${TICKET_ID}/response' \
    -H 'Authorization: Bearer ${ADMIN_TOKEN}' \
    -H 'Content-Type: application/json' \
    -d '{\"message\": \"Thank you for contacting support. We are looking into your issue.\"}'"

# Summary
log_test "\n${YELLOW}======================================${NC}"
log_test "${YELLOW}Test Summary${NC}"
log_test "${YELLOW}======================================${NC}"
log_test "Full test log saved to: ${LOG_FILE}"
echo ""

# Count results
passed=$(grep -c "✓ PASS" "${LOG_FILE}" || echo "0")
failed=$(grep -c "✗ FAIL" "${LOG_FILE}" || echo "0")
total=$((passed + failed))

log_test "Total Tests: ${total}"
log_test "${GREEN}Passed: ${passed}${NC}"
log_test "${RED}Failed: ${failed}${NC}"

if [ "$failed" -eq 0 ]; then
    log_test "\n${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    log_test "\n${RED}❌ Some tests failed. Check log for details.${NC}"
    exit 1
fi
