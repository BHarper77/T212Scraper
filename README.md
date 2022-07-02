# T212Scraper

## Prerequisites

1. Create a `config.env` file in root directory
2. Add your T212 username and password to this file under the following variables
    1. `T212USERNAME`
    2. `T212PASSWORD`
    3. `SPREADSHEETID`
3. Enter any relevant data into the `src/static.json` file

## Installation

1. Run `npm i` in parent directory

## Usage

1. `npm start`
2. If 2FA is enabled on Trading212 account, it will need user input
3. Stock Events web app requires a QR code to be scanned to login, this is done from the mobile app
