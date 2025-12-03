# iOS Shortcut Setup for Content Capture

This shortcut allows you to save links directly from the iOS Share Sheet to your Content Capture archive.

## Quick Setup

### 1. Create the Shortcut

1. Open the **Shortcuts** app on your iPhone/iPad
2. Tap **+** to create a new shortcut
3. Add these actions in order:

#### Action 1: Receive Input
- Search for **"Receive"**
- Select **"Receive [any input] from Share Sheet"**
- Tap "any" and select: **URLs**, **Safari web pages**, **Text**

#### Action 2: Get URLs from Input
- Search for **"URLs"**
- Select **"Get URLs from Input"**

#### Action 3: Get Contents of URL (API Call)
- Search for **"Get Contents"**
- Select **"Get Contents of URL"**
- Tap **"URL"** and enter: `https://YOUR-APP-URL/api/capture`
- Tap **"Show More"**
- Set **Method** to: `POST`
- Set **Headers**:
  - Key: `Content-Type`
  - Value: `application/json`
- Set **Request Body** to: `JSON`
- Add field:
  - Key: `url`
  - Value: (select **URLs** from the input)

#### Action 4: Show Result (Optional)
- Search for **"Show Result"**
- Select **"Show Result"**
- This will display the API response (success/failure)

### 2. Configure the Shortcut

1. Tap the shortcut name at the top
2. Rename it to **"Save to Archive"** (or your preferred name)
3. Tap **"i"** (info) button
4. Enable **"Show in Share Sheet"**
5. Under **"Share Sheet Types"**, select: URLs, Safari web pages

### 3. Add to Home Screen (Optional)

1. Tap **"Add to Home Screen"**
2. Choose an icon and color

## Usage

1. Find content you want to save (tweet, article, etc.)
2. Tap the **Share** button
3. Select **"Save to Archive"** from the share sheet
4. Wait for confirmation

## Troubleshooting

### "Could not connect to server"
- Check that your API URL is correct
- Ensure your server is running and accessible

### "URL already captured"
- This content is already in your archive (duplicate prevention)

### "Invalid request"
- The URL format wasn't recognized
- Try copying the URL directly instead of sharing

## API Endpoint Reference

```
POST /api/capture
Content-Type: application/json

{
  "url": "https://example.com/article",
  "notes": "Optional notes about this content"
}

Response (Success):
{
  "id": "uuid",
  "status": "pending",
  "sourceType": "web"
}

Response (Duplicate):
{
  "error": "URL already captured",
  "code": "DUPLICATE"
}
```

## Advanced: Add Notes

To add notes when saving:

1. Add **"Ask for Input"** action before the API call
2. Set Input Type to **Text**
3. Set Prompt to: "Add notes (optional)"
4. In the API call, add another JSON field:
   - Key: `notes`
   - Value: (select the **Provided Input**)
