# Go to this web address to see the swagger documentation.
http://localhost:8000/api-docs

# **Base Git Workflow Documentation**
Git Repository Structure

Our project follows this workflow to manage code changes and releases. The  branches in the repository are:

main: Represents the production-ready code.
feature: Used for developing  features .
release: Used for final testing and preparing for a new release.

**Branch Naming Conventions**

Feature Branches: feature/feature-name
Release Branches: release/version-number

Workflow Overview

1. Feature Development
    
    Create a New Feature Branch:
    
    bash
    

git checkout -b feature/feature-name

Work on Your Feature:

Make changes, commit locally, and push the feature branch to the remote repository.

bash

git add .
git commit -m "Feature: Description of the feature"
git push origin feature/feature-name

Open a Pull Request:

On the repository hosting platform (e.g., GitHub), open a pull request from the feature branch to the main branch.

Code Review:

Request code reviews from team members.
Address feedback and make necessary changes.

Approval and Merge:

After approval, merge the feature branch into the main branch.

bash

git checkout main
git pull origin main
git merge --no-ff feature/feature-name
git push origin main

1. Release Preparation
    
    Create a New Release Branch:
    
    bash
    

git checkout -b release/version-number

Final Testing and Bug Fixes:

Perform final testing and address any critical issues.

Open a Pull Request:

On the repository hosting platform (e.g., GitHub), open a pull request from the release branch to the main branch.

Code Review:

Request code reviews to ensure the stability of the release.
Address feedback and make necessary changes.

Approval and Merge:

After approval, merge the release branch into the main branch.

bash

git checkout main
git pull origin main
git merge --no-ff release/version-number
git push origin main

1. Hotfixes (if needed)
    
    Create a New Hotfix Branch:
    
    bash
    

git checkout -b hotfix/fix-description

Work on the Hotfix:

Make necessary changes, commit, and push the hotfix branch.

bash

git add .
git commit -m "Hotfix: Description of the fix"
git push origin hotfix/fix-description

Open a Pull Request:

On the repository hosting platform (e.g., GitHub), open a pull request from the hotfix branch to the main branch.

Code Review:

Request code reviews to ensure the correctness of the hotfix.
Address feedback and make necessary changes.

Approval and Merge:

After approval, merge the hotfix branch into the main branch.

bash

git checkout main
git pull origin main
git merge --no-ff hotfix/fix-description
git push origin main

# **Setting Up Google OAuth**

To enable Google OAuth login functionality in the application, follow these steps:

1. **Create a Google Cloud Project**:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Navigate to "APIs & Services" > "Credentials"

2. **Configure OAuth Consent Screen**:
   - Click on "OAuth consent screen" tab
   - Select "External" user type (or "Internal" if for organization use only)
   - Fill in the required information (App name, user support email, developer contact info)
   - Add the necessary scopes (email, profile)
   - Save and continue

3. **Create OAuth Client ID**:
   - Click on "Credentials" tab
   - Click "Create Credentials" > "OAuth client ID"
   - Select "Web application" as the application type
   - Add a name for your OAuth client
   - Add authorized JavaScript origins (e.g., `http://localhost:5000`)
   - Add authorized redirect URIs (e.g., `http://localhost:5000/api/v0/auth/google/callback`)
   - Click "Create"

4. **Update Environment Variables**:
   - Copy your Client ID and Client Secret
   - Update the `.env` file with the following variables:
     ```
     GOOGLE_CLIENT_ID=your_client_id
     GOOGLE_CLIENT_SECRET=your_client_secret
     SESSION_SECRET=your_session_secret
     ```

5. **Test the Integration**:
   - Start the application
   - Navigate to the login page
   - Click on "Sign in with Google"
   - You should be redirected to Google's authentication page

Note: For production deployment, make sure to update the authorized origins and redirect URIs with your production domain.
