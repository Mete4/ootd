# OOTD — Usage Guide

## Quick Start

```bash
npm start
```
- Press **`w`** → opens in your web browser
- Scan the **QR code** with **Expo Go** app on your phone to use on mobile

---

## How Item Numbering Works

Every item in your closet has a **number** based on the order it was imported. The first item you imported is **#1**, the second is **#2**, and so on. This number is used for both photo assignment and outfit history.

You can see the current numbering at any time in the **Settings tab → Item Numbering** section.

---

## 1. Mass Import: Item Descriptions (Text)

**Settings tab → "Import Item Descriptions"**

**Format — Two lines per item, blank line between items:**
```
T-shirt
A plain white cotton slim-fit crew-neck

Dress Pants
Grey slim-cut trousers with a single button closure

Chinos
Khaki cotton chinos, tapered leg
```

**Rules:**
- Line 1 = exact sub-category name (e.g. `T-shirt`)
- Line 2+ = description text
- Blank line between each item block (Required to correctly separate items)

> **Tip:** If the app says you have fewer items than you pasted, ensure every item starts with a known sub-category and is preceded by a blank line or starts at the very top of the text.

| Category | Sub-categories |
|----------|---------------|
| Tops | T-shirt, Sweater, Sweatshirt, Long-Sleeve Top, Long-Sleeve T-Shirt, Long-Sleeve Performance Shirt, Polo Shirt, Short-Sleeve Button-Up Shirt, Short-Sleeve Camp Shirt, Button-Up Shirt |
| Bottoms | Jeans, Trousers, Chinos, Dress Pants, Cargo Pants, Hiking Pants, Sweatpants, Shorts, Cargo Shorts, Chino Shorts |
| Shoes | Loafers, Slide Sandals, Hiking Boots, Work Boots, Skate Sneakers, Running Shoes, Thong Sandals, Casual Sneakers |
| Jackets | Vest, Fleece Pullover, Jacket, Zip-Up Sweater, Zip-Up Hoodie, Faux Leather Jacket, Winter Parka |
| Misc | Hooded Robe |

Items are numbered **in the order they appear** in your paste. First block = Item #1, second = Item #2, etc.

---

## 2. Mass Import: Photos

**Settings tab → "Import Photos"**

Photos are matched to items by **date order** — your oldest photo maps to Item #1, the next-oldest to Item #2, and so on.

**Steps:**
1. In your phone's gallery, select photos sorted **oldest to newest**
2. The app assigns Photo #1 → Item #1, Photo #2 → Item #2, etc.
3. Only as many photos as you have items will be assigned

> **Tip:** Import your text descriptions first so items are numbered before you assign photos.

---

## 3. Mass Import: Past Outfit Dates

**Settings tab → "Import Outfit History"**

**Format — One line per date:**
```
4/8 1 3
3/15 2 5 7
1/1 1 2 8
12/25 3 6
```

- **Date:** `M/D` format (e.g. `4/8` = April 8th, `12/25` = December 25th)
- **Item numbers:** Space-separated 1-based index numbers referring to your item list order
- `4/8 1 3` = On April 8th, wore Item #1 and Item #3

> **Important:** Import your item descriptions **before** importing history, so the item numbers exist.

---

Every item in your closet now displays its **Item Number** (e.g., `#1`) directly on the thumbnail. 
- These numbers are stable and based on the order the item was added to the system.
- **Search by ID**: You can find any item instantly by typing its number (e.g., `5` or `#5`) into any search bar in the app.
- Use these numbers for quick reference when importing outfit history or organizing your physical closet.

---

## 5. Adding a Single Item Manually

Tap the **green `+` button** (bottom-right of the **Closet tab**).

1. **Add Photo**: Tap the "Add Photo" section to pick an image from your gallery for this specific item.
2. **Fill Details**: Enter Name, Brand, Color, Size, Price, Location, Category, and Season.
3. Tap **Add to Closet**.

---

## 6. Item Details & Wear History

Tapping any item in the closet opens its **Details** view:
- **Pinch-to-Zoom**: Tap the main image to open it in full-screen. You can then **pinch to zoom** or expand to see details up close.
- **Change Photo**: Tap **Edit (Pencil icon)**, then tap the image area to select a new one from your gallery.
- **Wear History**: A list of every date you've worn this item in a logged outfit.
- **Interactive Dates**: Tap any date in the Wear History list to instantly navigate to that day in the **Calendar** tab.

---

### JSON Backups (Settings Tab)
For full data portability, use the JSON tools:
- **Export Closet (JSON)**: Copies your entire garment database as a JSON string.
- **Import Closet (JSON)**: Appends items from a JSON string to your closet.
- **Export History (JSON)**: Copies your complete outfit history as a JSON string.
- **Import History (JSON)**: Appends history records from a JSON string.

---

## 7. Mass Editing & Selection (Closet Tab)

You can manage multiple items at once to speed up organization:

1. **Long-press** any item in the Closet to enter selection mode.
2. Tap additional items to add to your selection.
3. Use the **Edit** icon in the top header to bulk-apply traits (Brand, Color, Season, etc.) to all selected items at once.
4. Use the **Trash** icon to mass-delete items.

---

## 8. Managing Your History (Calendar Tab)

- **View Details**: Tap any item thumbnail in the daily outfit view to immediately see that item's details.
- **Visual Builder (Edit)**: Tapping **Edit (Pencil icon)** now opens the full **Outfit Builder** — an exact replica of the home page logger. This allows you to visually see your garments on a canvas while editing.
- **Edit Date**: You can now move an outfit to a different day while editing by selecting a new date in the builder's save modal.
- **Sorted Thumbnails**: All garments are automatically sorted by their **Item ID**, ensuring a consistent look for your recorded history.

---

## 9. Insights & Analytics (Stats Tab)
- **Interactive Links**: Tapping any item in the "Most Worn" or "Declutter" lists takes you to its detail screen.
- **Interactive Charts**: Pie charts now feature **direct labels** on each slice. You can toggle between **Qty** (item count) and **Value** (total cost) to see exactly where your investment lies.

---

## 10. Planning Today's Outfit (Home Tab)

1. **Select Date**: Tap the date header at the top to log outfits for a different day (useful for logging yesterday's outfit). A "Today" button will appear to quickly reset to the current date.
2. Use the **search bar** to find items by name, brand, or #ID (e.g., type "10" for Item #10).
3. Use the **category chips** to filter items.
4. Tap items to add them to the outfit canvas.
5. **Smart Suggestions**:
   - **One item selected**: The app grays out everything you've ever worn with that specific item.
   - **Two+ items selected**: The app *only* grays out items worn with **ALL** currently selected items at once. This helps you find new combinations you haven't matched before.
6. A **Warning** appears if you pick a combination you've worn previously.
7. Tap **Log Outfit** to save.

---

## 8. Modal & Menu Interaction

Across the entire app (Edit Outfit, Mass Edit, Add Item), all menus support **Tap-to-Dismiss**:
- Instead of having to find a "Cancel" button, you can simply **tap the dimmed background** area to close the current menu and return to the previous screen.

---

## 9. Calendar Tab

- Shows all logged outfit days with a professional **indicator dot**.
- Tap a day to view what was worn.
- **Edit/Delete**: Edit the name/note of an outfit or delete it directly from the day view.
- **Deep Linking**: If you arrived here from an item's "Wear History," the specific date will be automatically selected and highlighted for you.

---

## 10. Statistics Tab

Unlock insights into your personal style:
- **Composition Charts**: View your wardrobe breakdown by Category or Brand. Toggle between **Qty** (how many items) and **Value** (total dollar amount).
- **Most Worn Items**: A ranked list of your Top 5 items with total wear counts.
- **Cost Per Wear (CPW)**: Shows the true value of your garments by dividing the price by the number of times worn.
- **Declutter List**: Highlights the items you wear least often to help you optimize your closet space.
- **Navigation**: Tap any item in the Most Worn or Declutter lists to jump straight to that item's details.

---

## 11. Exporting & Backups

**Settings tab → "Export Data"**

Keep your data safe or share it:
- **Export Wardrobe**: Generates a text block of your entire closet in the import format.
- **Export Outfit History**: Generates your history log in the `M/D # #` format.
- Tap **Copy & Close** to instantly save the data to your phone's clipboard.

---

## 12. De-Duplicate Closet

**Settings tab → System → "De-Duplicate Closet"**

If your closet has accumulated duplicate entries (e.g. from re-importing the same data), use this tool to clean up:

1. Go to **Settings** and scroll down to the **System** section.
2. Tap **De-Duplicate Closet**.
3. Confirm with **Clean Up** — the app will scan every item and remove exact duplicates (matching subcategory, description, brand, and color).
4. Outfit history is automatically cleaned to reference only the kept items.

> **Note:** This action cannot be undone. Export your data first if you want a backup.

---

## 13. Getting the App on Your Phone

### Option A: Expo Go (easiest, requires WiFi while launching)
1. Install **Expo Go** from the App Store / Play Store
2. Run `npm start` on your computer
3. Scan the QR code — app opens on your phone
4. Data saves locally on-device

### Option B: Build on Expo infrastructure (EAS Build) - **No Android Studio needed**

This is the easiest way to get a standalone app if you don't want to install Android Studio. Expo's servers do the building for you.

1. **Install EAS CLI:**
   ```bash
   npm install -g eas-cli
   ```
2. **Login to your Expo account:**
   ```bash
   eas login
   ```
3. **Configure the project:**
   ```bash
   eas build:configure
   ```
4. **Build the Standalone App (EAS):**

   **For Android (APK):**
   ```bash
   eas build --platform android --profile preview
   ```
   *Follow the prompts. Choose "Yes" for any automated setup. This will take ~5-15 minutes. Once finished, download the `.apk` from the provided URL.*

   **For iOS (Apple):**
   ```bash
   eas build --platform ios --profile preview
   ```
   *Note: To build for iOS, you must have a paid **Apple Developer Program** account ($99/year). If you have one, follow the prompts to log in and let EAS manage your certificates. Once finished, you can install the app via the link provided or through **TestFlight**.*

5. **Download and Install:**
   Once the build finished, EAS will provide a URL/QR code. Scan it or download the file to install the app directly on your phone.

---

### Option C: Build locally on your own computer (Manual)

You can also build a real APK entirely on your own machine if you have Android Studio.

**Requirements:**
- [Android Studio](https://developer.android.com/studio) installed
- Android SDK set up

**Steps:**
```bash
# 1. Generate the native Android project
npx expo prebuild --platform android

# 2. Build the debug APK locally
cd android
./gradlew assembleRelease
```

The `.apk` file will be at: `android/app/build/outputs/apk/release/app-release.apk`

Transfer this file to your phone and install it.

**Or run directly on a connected Android phone/emulator:**
```bash
npx expo run:android
```
This builds and installs directly to any connected Android device — no Expo account needed.

---

## 14. Recommended First-Time Setup Order

1. **Import item descriptions** (Settings → Import Item Descriptions)
2. **Import photos** (Settings → Import Photos) — oldest photo = Item #1
3. **Import past outfit history** (Settings → Import Outfit History) using item numbers
4. Start using the Home tab to plan daily outfits

## 15. Shareable Closet & Outfit Suggestions

You can share your closet with friends so they can suggest outfits for you.

1. Open the **Closet** tab and tap the link icon at the right of the header.
2. Tap **Create Link**. The app sends your items and photos to Supabase. The link shows at once, and the photos keep sending if you close the sheet.
3. Tap **Send** to give the link to a friend, or **Copy** to copy it.
4. Your friends open the link on any device, select clothes, and send you outfit ideas.
5. On the Home tab, tap the bell icon to see the ideas and accept them. The bell count updates when you come back to Home or open the app. On the Suggestions screen, pull down to check for new ideas.
6. After you change your closet, open the sheet again and tap **Update with latest changes**. The address stays the same.

Only a person with the link can open a closet. The public key cannot list links, closets, suggestions or photo folders. Only your phone, which holds the owner secret, can read your suggestions. To test these rules, run `node scripts/verify-share-access.mjs`.

Archived items are never shared. In vacation mode, the sheet also offers a **Packing List** link that holds only the packed clothes. That link deletes itself when it expires.

### Deploy the web viewer on Vercel

The share link only works if the web viewer is actually deployed. Building with `npm run build` just creates the production files in `web/dist`; it does not publish them.

1. Create a Vercel project for the `web` folder.
2. Set the project root to `web`.
3. Use `npm run build` as the build command.
4. Use `dist` as the output directory.
5. Redeploy after any change to `web/vercel.json`.
6. From the `web` folder, run `vercel --prod` to publish the site.

The app makes links of the form `<viewer address>/closet/<token>`. The viewer address is set in `shareUrlFor` in `src/utils/sync.ts`. If you deploy the viewer to a different address, change it there and make a new build.
