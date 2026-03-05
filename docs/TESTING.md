# SHIELD Scanner Testing Guide

**Copyright © 2026 Georges Bou Ghantous. All Rights Reserved.**

This document provides comprehensive testing procedures for SHIELD Scanner UI and functionality.

---

## Table of Contents

- [UI Feature Checklist](#ui-feature-checklist)
- [Input Validation Tests](#input-validation-tests)
- [Button Behavior Tests](#button-behavior-tests)
- [Report Loading Tests](#report-loading-tests)
- [Authorization File Tests](#authorization-file-tests)
- [End-to-End Workflow Tests](#end-to-end-workflow-tests)
- [Error Handling Tests](#error-handling-tests)
- [Responsive Design Tests](#responsive-design-tests)

---

## UI Feature Checklist

### Layout Components

- ✅ **Sidebar (Left)**
  - [ ] GitHub Connection panel displays repository name
  - [ ] User GitHub Token panel with password field
  - [ ] Scan Configuration panel with all inputs
  - [ ] Run panel with status links
  - [ ] Console panel with scrollable log

- ✅ **Main Content (Right)**
  - [ ] Report Summary header with Clear Report button
  - [ ] Download buttons (MD and JSON) in blue
  - [ ] Summary cards (4 total: Grade, Mode, Findings, Last Updated)
  - [ ] Severity breakdown grid (5 cards: Critical, High, Medium, Low, Info)
  - [ ] Top findings table with 5 columns
  - [ ] Footer with copyright notice

### Panel Separation

- ✅ **GitHub Connection Panel**
  - [ ] Shows repository: "Georges034302/SHIELD-scanner"
  - [ ] Auto-detection works from GitHub Pages URL
  - [ ] Has proper card styling with border

- ✅ **User GitHub Token Panel**
  - [ ] Separate card from GitHub Connection
  - [ ] Title: "User GitHub Token"
  - [ ] Password input field
  - [ ] Security note displayed
  - [ ] Token marked as "(Required)"

---

## Input Validation Tests

### Test Case 1: Token Validation

**Objective:** Ensure token is required before scan starts

**Steps:**
1. Open scanner UI
2. Leave token field empty
3. Fill target URL: `https://example.com`
4. Click "Submit & Start"

**Expected Result:**
- ⚠️ Error message: "GitHub token is required. Please enter your token."
- Scan does not start
- Status remains "Idle"

---

### Test Case 2: Target URL Validation

**Objective:** Ensure target URL is required

**Steps:**
1. Fill token: `ghp_xxxxxx`
2. Leave target URL empty
3. Click "Submit & Start"

**Expected Result:**
- ⚠️ Error message: "Target URL is required."
- Scan does not start

---

### Test Case 3: Authorization File - Mode Check

**Objective:** Verify auth file required for authorized mode

**Steps:**
1. Fill token and target URL
2. Select mode: "authorized"
3. Do not upload file
4. Click "Submit & Start"

**Expected Result:**
- ⚠️ Error message: "Authorization file is required for authorized mode."
- Scan does not start

---

### Test Case 4: Authorization File - Format Validation

**Objective:** Ensure only .txt files accepted

**Steps:**
1. Fill token and target URL
2. Select mode: "authorized"
3. Upload a .pdf file
4. Click "Submit & Start"

**Expected Result:**
- ⚠️ Error message: "Authorization file must be a .txt file."
- Scan does not start

---

### Test Case 5: Authorization File - Content Validation

**Objective:** Validate all 4 required fields present

**Steps:**
1. Fill token and target URL
2. Select mode: "authorized"
3. Upload .txt file missing "Admin login" field:
```txt
Site to scan: https://example.com
Organization: Test Corp
Authorizer: John Doe
```
4. Click "Submit & Start"

**Expected Result:**
- ⚠️ Error message listing missing fields:
```
Authorization file is missing required fields:
  • Admin login

Example format:
Site to scan: https://example.com
Organization: Example Corp
Authorizer: John Doe
Admin login: admin@example.com (or N/A)
```
- Scan does not start

---

### Test Case 6: Valid Authorization File

**Objective:** Verify scan starts with valid auth file

**Steps:**
1. Fill token and target URL
2. Select mode: "authorized"
3. Upload valid .txt file:
```txt
Site to scan: https://example.com
Organization: Test Corporation
Authorizer: Jane Smith
Admin login: N/A
```
4. Click "Submit & Start"

**Expected Result:**
- ✓ Console shows: "Authorization file validated successfully."
- Scan dispatches to GitHub Actions
- All sensitive fields cleared from DOM

---

## Button Behavior Tests

### Test Case 7: Reset Button

**Objective:** Verify Reset clears input fields only

**Steps:**
1. Fill token, target URL, and select a file
2. Select mode: "authorized", profile: "deep"
3. Click "Reset"

**Expected Result:**
- Token field cleared
- Target URL field cleared
- File selection cleared  
- Mode reset to "posture"
- Profile reset to "standard"
- Report summary remains unchanged (if loaded)
- Console log shows: "Input fields cleared."

---

### Test Case 8: Clear Report Button - With Data

**Objective:** Verify Clear Report clears all report data

**Prerequisites:** Report loaded in UI

**Steps:**
1. After a scan completes with data displayed
2. Click "Clear Report" button

**Expected Result:**
- All summary cards show "—" or "0"
- Findings table shows "No data loaded yet."
- Run ID, Auth Branch, links reset to "—"
- Console log reset to "Waiting…"
- Status reset to "Idle"
- Download buttons become disabled (greyed out)
- Console shows: "Report summary cleared."

---

### Test Case 9: Clear Report Button - Without Data

**Objective:** Verify button clickable even when no data

**Prerequisites:** Fresh page load, no report loaded

**Steps:**
1. Open scanner UI (no scan run yet)
2. Click "Clear Report" button

**Expected Result:**
- Button is clickable (not disabled)
- All fields reset to defaults
- Download buttons disabled
- Console shows: "Report summary cleared."
- No errors

---

### Test Case 10: Download Buttons - Initial State

**Objective:** Verify buttons disabled on page load

**Steps:**
1. Open scanner UI
2. Observe download buttons

**Expected Result:**
- "Download report.md" button: 40% opacity, greyed out
- "Download report.json" button: 40% opacity, greyed out
- Cursor shows "not-allowed" on hover
- Buttons not clickable

---

### Test Case 11: Download Buttons - After Report Loads

**Objective:** Verify buttons enabled after report loads

**Prerequisites:** Scan completed, report deployed to Pages

**Steps:**
1. Wait for scan to complete
2. Wait for auto-refresh (or click Refresh button)
3. Observe download buttons

**Expected Result:**
- Both buttons become fully opaque (100%)
- Both buttons blue (primary color)
- Cursor shows pointer on hover
- Buttons clickable
- Clicking downloads respective files

---

### Test Case 12: Refresh Button

**Objective:** Verify manual refresh works with visual feedback

**Prerequisites:** Report deployed to Pages at `/latest/report.json`

**Steps:**
1. Click "Refresh from latest/report.json" button
2. Observe button state during operation

**Expected Result:**
- Button text changes to "Refreshing..."
- Button becomes disabled during operation
- After completion:
  - Button text back to "Refresh from latest/report.json"
  - Button enabled again
  - Report data loaded
  - Download buttons enabled
  - Console shows: "✓ Loaded latest/report.json and rendered summary."

---

## Report Loading Tests

### Test Case 13: Auto-Load on Page Load

**Objective:** Verify report auto-loads if available

**Prerequisites:** Previous scan completed, report at `/latest/report.json`

**Steps:**
1. Open scanner UI (fresh page load)
2. Wait 2-3 seconds

**Expected Result:**
- Report data automatically loads
- Summary cards populate
- Severity breakdown populates
- Findings table populates
- Download buttons enabled
- Console shows retry attempts (if needed) and success message

---

### Test Case 14: Auto-Load After Scan Completion

**Objective:** Verify auto-refresh after scan with retry logic

**Prerequisites:** Start a scan

**Steps:**
1. Wait for scan to complete (status: "completed")
2. Observe auto-refresh behavior

**Expected Result:**
- Status: "Waiting for Pages deployment..."
- Console shows retry attempts:
```
latest/report.json not ready yet (404). Retrying in 3s... (1/10)
latest/report.json not ready yet (404). Retrying in 5s... (2/10)
...
✓ Loaded latest/report.json and rendered summary.
```
- Report loads within ~90 seconds max
- Download buttons enabled
- Status: "✓ Done - Report loaded successfully"

---

### Test Case 15: Report Loading Failure

**Objective:** Verify graceful handling if report unavailable

**Prerequisites:** No report at `/latest/report.json`

**Steps:**
1. Open scanner UI
2. Click "Refresh from latest/report.json"
3. Wait for all retries to exhaust

**Expected Result:**
- Console shows retry attempts
- After final retry:
  - Status: "⚠ Report not available yet"
  - Console: "⚠ No latest report available: [error message]"
- Download buttons remain disabled
- No JavaScript errors in browser console
- UI remains functional

---

## Authorization File Tests

### Test Case 16: Field Name Case Insensitivity

**Objective:** Verify field matching is case-insensitive

**Steps:**
1. Upload .txt file with mixed case:
```txt
SITE TO SCAN: https://example.com
organization: Test Corp
AUTHORIZER: John Doe
admin LOGIN: N/A
```
2. Click "Submit & Start"

**Expected Result:**
- ✓ Validation passes
- All fields recognized
- Scan starts successfully

---

### Test Case 17: Extra Content Allowed

**Objective:** Verify additional content doesn't break validation

**Steps:**
1. Upload .txt file with extra content:
```txt
SECURITY ASSESSMENT AUTHORIZATION

Site to scan: https://example.com
Organization: Test Corporation
Authorizer: Jane Smith
Admin login: admin@test.com

Date: January 1, 2026
Duration: 30 days
Signature: [Digital Signature]

Additional notes:
This authorization is valid for vulnerability scanning only.
Contact info@test.com for questions.
```
2. Click "Submit & Start"

**Expected Result:**
- ✓ Validation passes
- Required fields found
- Extra content ignored
- Scan starts successfully

---

### Test Case 18: Fields in Any Order

**Objective:** Verify field order doesn't matter

**Steps:**
1. Upload .txt file with reordered fields:
```txt
Admin login: N/A
Organization: Test Corp
Site to scan: https://example.com
Authorizer: John Doe
```
2. Click "Submit & Start"

**Expected Result:**
- ✓ Validation passes
- All fields recognized
- Scan starts successfully

---

## End-to-End Workflow Tests

### Test Case 19: Complete Posture Scan Workflow

**Objective:** Full workflow test for posture mode

**Steps:**
1. Open scanner UI
2. Fill token: `ghp_[valid_token]`
3. Fill target URL: `https://example.com`
4. Mode: "posture" (default)
5. Profile: "quick"
6. Click "Submit & Start"
7. Wait for scan to complete

**Expected Result:**
- Validation passes
- Token, URL, file fields cleared after validation
- Console shows progress updates
- Workflow dispatched
- Run appears in GitHub Actions
- Status updates every 6 seconds
- After completion: Report auto-loads
- Download buttons enabled
- All report sections populated
- Artifacts link functional

---

### Test Case 20: Complete Authorized Scan Workflow

**Objective:** Full workflow test for authorized mode

**Steps:**
1. Create auth.txt:
```txt
Site to scan: https://example.com
Organization: Test Corp
Authorizer: Test User
Admin login: N/A
```
2. Fill token and URL
3. Mode: "authorized"
4. Profile: "standard"
5. Upload auth.txt
6. Click "Submit & Start"
7. Wait for scan to complete

**Expected Result:**
- Validation passes (all 4 fields found)
- Auth branch created
- Auth file committed
- Scan completes
- Report loads with authorized mode data
- All features work as expected

---

## Error Handling Tests

### Test Case 21: Invalid GitHub Token

**Objective:** Verify graceful handling of invalid token

**Steps:**
1. Fill token: `invalid_token_123`
2. Fill URL: `https://example.com`
3. Click "Submit & Start"

**Expected Result:**
- API call fails
- Status shows error: "Error: [error message]"
- Console shows: "ERROR: [detailed error]"
- Button re-enables
- User can retry with correct token

---

### Test Case 22: Network Failure

**Objective:** Verify handling when GitHub API unreachable

**Prerequisites:** Disconnect network or block api.github.com

**Steps:**
1. Fill valid inputs
2. Click "Submit & Start"
3. Observe error handling

**Expected Result:**
- Fetch fails
- Error message displayed
- Button re-enables
- No undefined errors
- User can retry

---

## Responsive Design Tests

### Test Case 23: Mobile Layout

**Objective:** Verify UI works on mobile screens

**Steps:**
1. Resize browser to 375px width
2. Test all functionality

**Expected Result:**
- Sidebar stacks above content
- All buttons accessible
- Text readable (no overflow)
- Inputs full width
- Tables scroll horizontally
- Cards stack properly

---

### Test Case 24: Tablet Layout

**Objective:** Verify UI works on tablet screens

**Steps:**
1. Resize browser to 768px width
2. Test all functionality

**Expected Result:**
- Layout adapts smoothly
- Sidebar 380px fixed (if space allows)
- Content area flexible
- All features accessible

---

## Performance Tests

### Test Case 25: Page Load Speed

**Objective:** Verify fast initial load

**Steps:**
1. Clear browser cache
2. Navigate to scanner URL
3. Measure time to interactive

**Expected Result:**
- First paint: < 1 second
- Time to interactive: < 2 seconds
- No external dependencies loaded
- No render-blocking resources

---

### Test Case 26: Memory Usage

**Objective:** Verify no memory leaks during long sessions

**Steps:**
1. Open browser dev tools
2. Run multiple scans consecutively
3. Monitor memory usage

**Expected Result:**
- Memory usage stable
- No continuous growth
- Event listeners cleaned up properly
- DOM nodes released after clearing

---

## Security Tests

### Test Case 27: Token Clearing

**Objective:** Verify token removed from DOM after use

**Steps:**
1. Fill token in password field
2. Click "Submit & Start"
3. Inspect DOM during scan

**Expected Result:**
- Token field value cleared immediately after validation
- Token not in DOM anywhere
- Token not in browser memory (as far as testable)
- Only used for API calls

---

### Test Case 28: Authorization File Security

**Objective:** Verify auth file not exposed in UI

**Steps:**
1. Upload auth file
2. Click "Submit & Start"
3. Inspect DOM and network

**Expected Result:**
- File selection cleared after use
- File content not logged to console
- File only transmitted to GitHub API
- Stored in ephemeral branch only

---

## Browser Compatibility

### Test Case 29: Browser Support

**Browsers to test:**
- ✅ Chrome/Edge (Chromium-based)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile Safari (iOS)
- ✅ Chrome Mobile (Android)

**Features to verify:**
- File upload works
- Fetch API works
- ES6+ features work
- CSS Grid/Flexbox render correctly
- All interactive elements functional

---

## Continuous Testing Checklist

Use this checklist before each deployment:

- [ ] All input validations working
- [ ] All buttons clickable and functional
- [ ] Download buttons state management correct
- [ ] Reset button clears fields only
- [ ] Clear Report button clears report data
- [ ] Authorization file validation working
- [ ] Report auto-loads after scan
- [ ] Retry logic functioning (up to 10 retries)
- [ ] Manual refresh button working
- [ ] Console log displaying updates
- [ ] No JavaScript errors in browser console
- [ ] Responsive design works (mobile, tablet, desktop)
- [ ] GitHub API integration working
- [ ] Token security measures in place
- [ ] All download links functional
- [ ] Performance acceptable (load time, memory)

---

## Reporting Issues

When reporting bugs, include:

1. **Browser & Version:** Chrome 120, Firefox 121, etc.
2. **Steps to Reproduce:** Detailed sequence
3. **Expected Result:** What should happen
4. **Actual Result:** What actually happened
5. **Screenshots:** If applicable
6. **Console Logs:** Copy from browser dev tools
7. **Network Tab:** For API failures

---

**Last Updated:** March 5, 2026  
**Version:** 1.0.0
