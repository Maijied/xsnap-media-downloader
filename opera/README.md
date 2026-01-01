# XSnap - Media Downloader for X

A Firefox browser extension to easily download videos, GIFs, and images from X (formerly Twitter) in all available resolutions.

![XSnap Icon](icons/icon-128.png)

## Features

- 📹 **Download Videos** - Save videos in multiple quality options (720p, 1080p, etc.)
- 🎞️ **Download GIFs** - Save animated GIFs as MP4 files
- 🖼️ **Download Images** - Save images in original quality
- 🎯 **One-Click Download** - Simple download button appears on hover
- 📊 **Quality Selection** - Choose from all available resolutions
- 🔒 **Privacy Focused** - No data collection, works entirely locally

## Installation

### From Firefox Add-ons Store
1. Visit the [XSnap Add-on Page](#) (link coming soon)
2. Click "Add to Firefox"
3. Grant the required permissions

### Manual Installation (For Development)
1. Download or clone this repository
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the sidebar
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file from this folder

## Usage

1. Navigate to any X (Twitter) post containing media
2. Hover over any image or video
3. Click the blue download button (⬇) that appears
4. For videos: Select your preferred quality from the popup
5. For images: Click to download immediately
6. Choose where to save the file

## Permissions Explained

- **downloads**: Required to save files to your computer
- **storage**: Stores API tokens locally for authenticated requests
- **webRequest**: Captures authentication tokens from X's API
- **Host permissions for x.com/twitter.com**: Required to interact with X's website and API

## Technical Details

This extension works by:
1. Capturing authentication tokens from X's existing API requests
2. Using X's GraphQL API to fetch media information
3. Extracting video/image URLs with all available qualities
4. Downloading media using Firefox's download API

## Privacy

- **No data collection**: The extension does not collect or transmit any user data
- **No external servers**: All processing happens locally in your browser
- **Open source**: Full source code available for review

## Troubleshooting

**Download button not appearing?**
- Make sure you're on x.com or twitter.com
- Try refreshing the page
- Scroll the page to trigger the extension

**Getting errors?**
- Reload the X/Twitter page and scroll once
- The extension needs to capture API tokens from normal browsing

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Changelog

### v1.0.0
- Initial release
- Video, GIF, and image download support
- Quality selection for videos
- One-click download interface
