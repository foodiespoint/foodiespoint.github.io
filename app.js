// ==========================================================================
// 1. FIREBASE & RENDER VAPID CONFIGURATION (v21 - BETA ISOLATED)
// ==========================================================================
const CURRENT_APP_VERSION = "v21";
const VAPID_PUBLIC_KEY = "BCYZCGMueIWWUU7cA2m4-fmHK0gEbmwqfSMHyzXr4AGdyhDi53mct0OoEfnPttK-1D3LV8guB3-RtfFYABa82bo";
const RENDER_BACKEND_URL = "https://foodies-backend-9vvj.onrender.com";

let db = null;

try {
  const firebaseConfig = {
    apiKey: "AIzaSyDu-pEongNewYbzc9-FG477NRVW2izilzM",
    authDomain: "foodiespoint-6760.firebaseapp.com",
    databaseURL: "https://foodiespoint-6760-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "foodiespoint-6760",
    storageBucket: "foodiespoint-6760.firebasestorage.app",
    messagingSenderId: "160661145433",
    appId: "1:160661145433:web:616afe0d7ca7cdf0faae48"
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  db = firebase.database();
  console.log(`[Firebase ${CURRENT_APP_VERSION} Beta] Initialized successfully.`);
} catch (error) {
  console.error(`[Firebase ${CURRENT_APP_VERSION} Beta] Initialization error:`, error);
}

// ==========================================================================
// 2. TIME-BOUND OPERATING WINDOW & 6:00 PM AUTOMATIC RESET ENGINE
// ==========================================================================
function isDuringBreakWindow() {
  const now = new Date();
  const hour = now.getHours();
  return (hour >= 18 && hour < 21);
}

function checkDaily6PMReset() {
  const now = new Date();
  const hour = now.getHours();
  const todayStr = now.toDateString();
  const lastResetDate = localStorage.getItem('fp_beta_last_reset_date');

  if (hour >= 18 && hour < 21 && lastResetDate !== todayStr) {
    localStorage.setItem('fp_beta_last_reset_date', todayStr);
    kitchenCheckedState = {};

    if (db) {
      db.ref('beta_dailyMenu').remove()
        .then(() => {
          console.log(`[${CURRENT_APP_VERSION}] 6:00 PM reached: Beta Menu cleared.`);
          renderKitchenMenu();
        })
        .catch((err) => console.error("Error clearing beta menu at 6 PM:", err));
    } else {
      renderKitchenMenu();
    }
  }
}

// ==========================================================================
// 3. MANDATORY APP ONBOARDING & FAIL-PROOF PUSH ENGINE
// ==========================================================================
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function checkAppOnboarding() {
  if (isKitchenMode) {
     document.getElementById('profile-modal').style.display = 'none';
     document.getElementById('notification-permission-modal').style.display = 'none';
     return;
  }

  const profileStr = localStorage.getItem('fp_beta_customer_profile');
  if (!profileStr) {
     document.getElementById('profile-modal').style.display = 'flex';
     document.getElementById('notification-permission-modal').style.display = 'none';
     return;
  }

  if ('Notification' in window && Notification.permission === 'default') {
     document.getElementById('profile-modal').style.display = 'none';
     document.getElementById('notification-permission-modal').style.display = 'flex';
     return;
  }

  document.getElementById('profile-modal').style.display = 'none';
  document.getElementById('notification-permission-modal').style.display = 'none';
}

function saveCustomerProfile() {
  const nameInput = document.getElementById('cust-name-input');
  const mobileInput = document.getElementById('cust-mobile-input');
  
  const nameVal = nameInput ? nameInput.value.trim() : '';
  const mobileVal = mobileInput ? mobileInput.value.trim() : '';

  if (nameVal.length < 2) {
    alert("Please enter a valid Name (at least 2 characters).");
    return;
  }
  if (!/^[0-9]{10}$/.test(mobileVal)) {
    alert("Please enter a valid 10-digit Mobile Number.");
    return;
  }

  const customerProfile = { name: nameVal, mobile: mobileVal };
  localStorage.setItem('fp_beta_customer_profile', JSON.stringify(customerProfile));
  
  if (db) {
    db.ref(`beta_customers/${customerProfile.mobile}`).update({
      name: customerProfile.name,
      mobile: customerProfile.mobile,
      appVersion: CURRENT_APP_VERSION,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    }).catch(e => console.error(e));
  }
  
  checkAppOnboarding();
}

function updateCustomerPresence() {
  const profileStr = localStorage.getItem('fp_beta_customer_profile');
  if (profileStr && db && !isKitchenMode) {
    const profile = JSON.parse(profileStr);
    db.ref(`beta_customers/${profile.mobile}`).update({
      appVersion: CURRENT_APP_VERSION,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    }).catch(e => console.error("Presence update failed:", e));
  }
}

async function autoSyncPushToken() {
  if ('serviceWorker' in navigator && 'PushManager' in window && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }
      if (sub && db) {
        const subJson = sub.toJSON();
        localStorage.setItem('fp_beta_push_sub_cached', JSON.stringify(subJson));
        
        const dbKey = btoa(subJson.endpoint).replace(/[.#$/\[\]]/g, "_");
        db.ref(`beta_pushSubscriptions/${dbKey}`).set(subJson);
        
        const profileStr = localStorage.getItem('fp_beta_customer_profile');
        if (profileStr) {
           const profile = JSON.parse(profileStr);
           db.ref(`beta_customers/${profile.mobile}/pushSubscription`).set(subJson);
        }
      }
    } catch(e) {
      console.warn("Silent token auto-sync skipped:", e);
    }
  }
}

async function getLocalPushSubscription() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();

      if (!subscription && Notification.permission === 'granted') {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }

      if (subscription) {
        const subJson = subscription.toJSON();
        localStorage.setItem('fp_beta_push_sub_cached', JSON.stringify(subJson));
        return subJson;
      }
    } catch (e) {
      console.warn("Could not fetch active push sub from service worker:", e);
    }
  }
  const cached = localStorage.getItem('fp_beta_push_sub_cached');
  return cached ? JSON.parse(cached) : null;
}

async function syncKitchenPushSubscription() {
  const sub = await getLocalPushSubscription();
  if (sub && db) {
    const dbKey = btoa(sub.endpoint).replace(/[.#$/\[\]]/g, "_");
    db.ref(`beta_kitchenSubscriptions/${dbKey}`).set(sub);
  }
}

async function openAlertsModal() {
  if (!('Notification' in window)) {
    alert("Push notifications are not supported on this browser/device.");
    return;
  }
  if (Notification.permission === 'granted') {
    await requestPushAccess(true);
    alert("✅ Notifications are already enabled!");
  } else if (Notification.permission === 'denied') {
    alert("🚫 Notifications are blocked in your browser/phone settings. Please tap the Lock icon 🔒 in your address bar -> Permissions -> Allow.");
  } else {
    document.getElementById('notification-permission-modal').style.display = 'flex';
  }
}

async function requestPushAccess(isSilentSync = false) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (!isSilentSync) alert("Push notifications are not supported on this browser.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    
    if (!isSilentSync) {
       checkAppOnboarding();
    }

    if (permission !== 'granted') {
      if (!isSilentSync) alert("🚫 Notifications were blocked. You will not receive live order updates.");
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const subJson = subscription.toJSON();
    localStorage.setItem('fp_beta_push_sub_cached', JSON.stringify(subJson));

    const dbKey = btoa(subJson.endpoint).replace(/[.#$/\[\]]/g, "_");
    await db.ref(`beta_pushSubscriptions/${dbKey}`).set(subJson);
    
    const profileStr = localStorage.getItem('fp_beta_customer_profile');
    if (profileStr) {
       const profile = JSON.parse(profileStr);
       await db.ref(`beta_customers/${profile.mobile}/pushSubscription`).set(subJson);
    }

    if (isSilentSync) {
      console.log("Push connection verified.");
    } else {
      alert("✅ Notifications enabled successfully!");
    }
  } catch (error) {
    console.error(`[Push] Error:`, error);
  }
}

async function sendRenderPushBroadcast(title, message) {
  try {
    const snap = await db.ref('beta_pushSubscriptions').once('value');
    const subsObj = snap.val();
    if (!subsObj) return;

    const subscriptions = Object.values(subsObj);
    const response = await fetch(`${RENDER_BACKEND_URL}/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message, subscriptions })
    });

    const data = await response.json();
    if (data.expiredEndpoints && data.expiredEndpoints.length > 0) {
      data.expiredEndpoints.forEach((expiredUrl) => {
        const dbKey = btoa(expiredUrl).replace(/[.#$/\[\]]/g, "_");
        db.ref(`beta_pushSubscriptions/${dbKey}`).remove();
      });
    }
  } catch (error) {
    console.error(`[Push] Error contacting Render push API:`, error);
  }
}

async function sendTargetedRenderPush(subscription, title, message) {
  if (!subscription || !subscription.endpoint) return;
  try {
    await fetch(`${RENDER_BACKEND_URL}/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message, subscriptions: [subscription] })
    });
  } catch (error) {
    console.error(`[Push] Error sending targeted push:`, error);
  }
}

async function resolveTargetSubscription(order) {
  if (order.pushSubscription && order.pushSubscription.endpoint) {
    return order.pushSubscription;
  }
  if (order.customerMobile) {
    try {
      const snap = await db.ref(`beta_customers/${order.customerMobile}/pushSubscription`).once('value');
      const sub = snap.val();
      if (sub && sub.endpoint) return sub;
    } catch(e) {
      console.error("Subscription fallback lookup error:", e);
    }
  }
  return null;
}

async function notifyKitchenNewOrder(orderData) {
  try {
    const snap = await db.ref('beta_kitchenSubscriptions').once('value');
    const subsObj = snap.val();
    if (!subsObj) return;

    const subscriptions = Object.values(subsObj);
    fetch(`${RENDER_BACKEND_URL}/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New Beta Order! 🔔",
        message: `${orderData.customerName} ordered ${orderData.orderType} for ${orderData.scheduledTime}`,
        subscriptions
      })
    });
  } catch(e) {
    console.error("Failed to notify kitchen:", e);
  }
}

// ==========================================================================
// 4. SERVICE WORKER REGISTRATION
// ==========================================================================
let swRegistration = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/sw.js?v=${CURRENT_APP_VERSION}`, { scope: '/' })
    .then((reg) => {
      swRegistration = reg;
      reg.update();

      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        }
      });
    })
    .catch((err) => {
      console.error(`[SW] Registration failed:`, err);
    });
  });
}

// ==========================================================================
// 5. STANDALONE DETECTION & INSTALLATION ENGINE
// ==========================================================================
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

function triggerAppInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choiceResult) => {
      deferredInstallPrompt = null;
    });
  } else {
    const installBtn = document.getElementById('btn-native-install');
    if (installBtn) {
      installBtn.textContent = "See Instructions Below 👇";
      installBtn.style.background = "#EAEAEA";
      installBtn.style.color = "#333";
      installBtn.style.boxShadow = "none";
    }
    const guide = document.getElementById('install-manual-guide');
    if (guide) {
      guide.style.display = 'block';
    }
  }
}

function isStandalonePWA() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

function enforceInstallGate() {
  const installGate = document.getElementById('install-gate-overlay');
  const appContent = document.getElementById('main-app-content');

  if (isStandalonePWA()) {
    if (installGate) installGate.style.setProperty('display', 'none', 'important');
    if (appContent) appContent.style.setProperty('display', 'block', 'important');
    
    setTimeout(() => {
      checkAppOnboarding();
    }, 500);
  }
}

// ==========================================================================
// 6. COMPLETE FOODIES POINT MENU & DYNAMIC MANAGEMENT
// ==========================================================================
const DEFAULT_MENU_ITEMS = [
  { id: 'dish-001', category: 'Rolls', name: 'Dahi Bread Roll (1 pc)', price: 15 },
  { id: 'dish-002', category: 'Rolls', name: 'Bread Roll (8 pc plate)', price: 80 },
  { id: 'dish-003', category: 'Rolls', name: 'Spring Roll', price: 25 },
  { id: 'dish-004', category: 'Rolls', name: 'Veg Kebab Roll', price: 20 },
  { id: 'dish-005', category: 'Rolls', name: 'Paneer Roll', price: 45 },
  { id: 'dish-006', category: 'Rolls', name: 'Egg Mayonnaise & Cheese Mix Roll', price: 50 },
  { id: 'dish-007', category: 'Rolls', name: 'Egg Mayonnaise Roll', price: 40 },
  { id: 'dish-008', category: 'Rolls', name: 'Egg Roll', price: 35 },
  { id: 'dish-009', category: 'Rolls', name: 'Chicken Roll', price: 55 },
  { id: 'dish-010', category: 'Rolls', name: 'Chicken Mayonnaise Roll', price: 60 },
  { id: 'dish-011', category: 'Rolls', name: 'Chicken Egg Roll', price: 70 },
  { id: 'dish-012', category: 'Rolls', name: 'Chicken Egg Mayonnaise Roll', price: 75 },
  { id: 'dish-013', category: 'Rolls', name: 'Crispy Veg. Cheese Bread Roll', price: 18 },
  { id: 'dish-014', category: 'Pakodi', name: 'Pyaaz ki Pakodi (250gm)', price: 60 },
  { id: 'dish-015', category: 'Pakodi', name: 'Paalak ki Pakodi (250gm)', price: 60 },
  { id: 'dish-016', category: 'Pakodi', name: 'Gobhi ki Pakodi (250gm)', price: 60 },
  { id: 'dish-017', category: 'Pakodi', name: 'Mirch ki Pakodi', price: 15 },
  { id: 'dish-018', category: 'Pakodi', name: 'Bread Pakoda', price: 20 },
  { id: 'dish-019', category: 'Pakodi', name: 'Egg Pakodi', price: 10 },
  { id: 'dish-020', category: 'Pakodi', name: 'Moong Daal ke Mongode (250gm)', price: 75 },
  { id: 'dish-021', category: 'Sandwich', name: 'Grilled Veg. Mayonaise Sandwich (2 pc)', price: 55 },
  { id: 'dish-022', category: 'Sandwich', name: 'Grilled Veg. Cheese Sandwich (2 pc)', price: 65 },
  { id: 'dish-023', category: 'Sandwich', name: 'Veg Sandwich', price: 18 },
  { id: 'dish-024', category: 'Snacks', name: 'Chocolate Croissant', price: 48 },
  { id: 'dish-025', category: 'Snacks', name: 'Zingy Parcel (Paneer)', price: 60 },
  { id: 'dish-026', category: 'Snacks', name: 'Pizza Puff', price: 18 },
  { id: 'dish-027', category: 'Snacks', name: 'Mini Pizza', price: 45 },
  { id: 'dish-028', category: 'Snacks', name: 'Veg Burger', price: 50 },
  { id: 'dish-029', category: 'Snacks', name: 'Aloo Patty', price: 17 },
  { id: 'dish-030', category: 'Snacks', name: 'Paneer Patty', price: 25 },
  { id: 'dish-031', category: 'Snacks', name: 'Veg Appe (12 pc plate)', price: 70 },
  { id: 'dish-032', category: 'Snacks', name: 'Phare (250gm)', price: 70 },
  { id: 'dish-033', category: 'Snacks', name: 'Veg Masala Idli (4 pc plate)', price: 50 },
  { id: 'dish-034', category: 'Snacks', name: 'Fried Idli (per plate)', price: 50 },
  { id: 'dish-035', category: 'Snacks', name: 'Poha (per plate)', price: 85 },
  { id: 'dish-036', category: 'Snacks', name: 'Crispy Stuffed Mushroom (4 pc plate)', price: 65 },
  { id: 'dish-037', category: 'Snacks', name: 'Aloo Bonda', price: 12 },
  { id: 'dish-038', category: 'Snacks', name: 'Vada Pav', price: 25 },
  { id: 'dish-039', category: 'Snacks', name: 'Cheese Balls (8 pc plate)', price: 85 },
  { id: 'dish-040', category: 'Snacks', name: 'Masala Vada (8 pc plate)', price: 80 },
  { id: 'dish-041', category: 'Snacks', name: 'Falafel Mushakkal Veg. Roll', price: 40 },
  { id: 'dish-042', category: 'Snacks', name: 'Pani Poori (5 pc)', price: 15 },
  { id: 'dish-043', category: 'Snacks', name: 'Tikki Chaat (per plate)', price: 55 },
  { id: 'dish-044', category: 'Snacks', name: 'Dahi Vada (4 pc plate)', price: 60 },
  { id: 'dish-045', category: 'Snacks', name: 'Raj Kachori (per plate)', price: 85 },
  { id: 'dish-046', category: 'Snacks', name: 'Samosa', price: 12 },
  { id: 'dish-047', category: 'Snacks', name: 'Paneer Tikka (per plate)', price: 240 },
  { id: 'dish-048', category: 'Snacks', name: 'Paneer Malai Tikka (per plate)', price: 260 },
  { id: 'dish-049', category: 'Chinese', name: 'Honey Chilli Potato', price: 90 },
  { id: 'dish-050', category: 'Chinese', name: 'Chowmein', price: 80 },
  { id: 'dish-051', category: 'Chinese', name: 'Macaroni', price: 80 },
  { id: 'dish-052', category: 'Chinese', name: 'Fried Rice', price: 80 },
  { id: 'dish-053', category: 'Chinese', name: 'Veg Manchurian', price: 80 },
  { id: 'dish-054', category: 'Chinese', name: 'Paneer Manchurian', price: 160 },
  { id: 'dish-055', category: 'Chinese', name: 'Chilli Paneer', price: 140 },
  { id: 'dish-056', category: 'Chinese', name: 'Veg Momos (10 pc)', price: 55 },
  { id: 'dish-057', category: 'Chinese', name: 'Paneer Momos (10 pc)', price: 75 },
  { id: 'dish-058', category: 'Chinese', name: 'Chicken Momos (10 pc)', price: 100 },
  { id: 'dish-059', category: 'Chinese', name: 'White Pasta', price: 100 },
  { id: 'dish-060', category: 'Kebabs', name: 'Veg. Seekh Kebab', price: 15 },
  { id: 'dish-061', category: 'Kebabs', name: 'Veg Kebab', price: 17 },
  { id: 'dish-062', category: 'Kebabs', name: 'Dahi ke Kebab', price: 25 },
  { id: 'dish-063', category: 'Kebabs', name: 'Hariyali Kebab', price: 25 },
  { id: 'dish-064', category: 'Cake (Egg-Less)', name: 'Tutti Frutti Cup Cake', price: 18 },
  { id: 'dish-065', category: 'Cake (Egg-Less)', name: 'Chocolate Cup Cake', price: 20 },
  { id: 'dish-066', category: 'Cake (Egg-Less)', name: 'Chocolava Cup Cake', price: 38 },
  { id: 'dish-067', category: 'Shakes', name: 'Mango Shake', price: 30 },
  { id: 'dish-068', category: 'Shakes', name: 'Lassi', price: 45 },
  { id: 'dish-069', category: 'Shakes', name: 'Panna', price: 12 },
  { id: 'dish-070', category: 'Meals & Combos', name: 'Chokha Baati (2 pc plate)', price: 50 },
  { id: 'dish-071', category: 'Meals & Combos', name: 'Aloo-Kulche Chole (per plate)', price: 70 },
  { id: 'dish-072', category: 'Meals & Combos', name: 'Chole Bhature (per plate)', price: 60 },
  { id: 'dish-073', category: 'Meals & Combos', name: 'Khasta Aloo Matar (2 pc plate)', price: 55 },
  { id: 'dish-074', category: 'Meals & Combos', name: 'Sambhar Vada (4 pc plate)', price: 55 },
  { id: 'dish-075', category: 'Meals & Combos', name: 'Idli Sambhar (4 pc plate)', price: 55 },
  { id: 'dish-076', category: 'Meals & Combos', name: 'Pav Bhaaji (per plate)', price: 60 },
  { id: 'dish-077', category: 'Sweets', name: 'Gulab Jamun', price: 20 },
  { id: 'dish-078', category: 'Sweets', name: 'Kheer', price: 80 },
  { id: 'dish-079', category: 'Sweets', name: 'Sweet Rice', price: 90 },
  { id: 'dish-080', category: 'Sweets', name: 'Shrikhand (250 gm)', price: 85 },
  { id: 'dish-081', category: 'Sabzi', name: 'Shaahi Paneer', price: 300 },
  { id: 'dish-082', category: 'Sabzi', name: 'Paneer Masala', price: 220 },
  { id: 'dish-083', category: 'Sabzi', name: 'Paneer Angara', price: 280 },
  { id: 'dish-084', category: 'Sabzi', name: 'Paneer Korma', price: 260 },
  { id: 'dish-085', category: 'Sabzi', name: 'Palak Paneer', price: 200 },
  { id: 'dish-086', category: 'Sabzi', name: 'Matar Paneer', price: 200 },
  { id: 'dish-087', category: 'Non-Veg', name: 'Chicken Afghani', price: 500 },
  { id: 'dish-088', category: 'Non-Veg', name: 'Roasted Chicken', price: 340 },
  { id: 'dish-089', category: 'Non-Veg', name: 'Chilli Chicken', price: 440 },
  { id: 'dish-090', category: 'Non-Veg', name: 'Egg Curry', price: 75 },
  { id: 'dish-091', category: 'Non-Veg', name: 'Fish Fry (boneless - 250 gm)', price: 180 },
  { id: 'dish-092', category: 'Non-Veg', name: 'Fish Dry (boneless - 250 gm)', price: 165 },
  { id: 'dish-093', category: 'Non-Veg', name: 'Chicken Shawarma', price: 90 },
  { id: 'dish-094', category: 'Non-Veg', name: 'Mutton Curry', price: 400 },
  { id: 'dish-095', category: 'Non-Veg', name: 'Mutton Korma', price: 430 },
  { id: 'dish-096', category: 'Non-Veg', name: 'Keema Kaleji', price: 400 },
  { id: 'dish-097', category: 'Non-Veg', name: 'Chicken Curry', price: 360 },
  { id: 'dish-098', category: 'Non-Veg', name: 'Chicken Masala', price: 400 },
  { id: 'dish-099', category: 'Non-Veg', name: 'Butter Chicken', price: 500 },
  { id: 'dish-100', category: 'Rice', name: 'Plain Rice', price: 90 },
  { id: 'dish-101', category: 'Rice', name: 'Jeera Rice', price: 120 },
  { id: 'dish-102', category: 'Rice', name: 'Matar Pulao', price: 140 },
  { id: 'dish-103', category: 'Rice', name: 'Veg. Biryani', price: 180 },
  { id: 'dish-104', category: 'Falahaar', name: 'Aloo-Sabudaana Tikki (2 pc)', price: 25 },
  { id: 'dish-105', category: 'Falahaar', name: 'Sabudaana Khichdi', price: 70 },
  { id: 'dish-106', category: 'Falahaar', name: 'Falahaari Mirch ki Pakodi', price: 15 }
];

let activeMenuItems = [...DEFAULT_MENU_ITEMS];
const cart = {};
let kitchenCheckedState = {};
let latestFirebaseMenuSnapshot = null;

function loadDynamicMenuCatalog() {
  if (!db) return;
  db.ref('beta_menu_catalog').on('value', (snap) => {
    const catalog = snap.val();
    activeMenuItems = catalog ? catalog : [...DEFAULT_MENU_ITEMS];
    if (isKitchenMode) renderKitchenMenu();
    if (!isKitchenMode && latestFirebaseMenuSnapshot) renderCustomerMenuFromSnapshot(latestFirebaseMenuSnapshot);
  });
}

function openAddItemModal() {
  document.getElementById('add-item-name').value = '';
  document.getElementById('add-item-price').value = '';
  
  const select = document.getElementById('add-item-category-select');
  const newCatInput = document.getElementById('add-item-category-new');
  
  select.innerHTML = '';
  newCatInput.style.display = 'none';
  newCatInput.value = '';

  const categories = [...new Set(activeMenuItems.map(item => item.category))];
  
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
  
  const addOpt = document.createElement('option');
  addOpt.value = 'ADD_NEW';
  addOpt.textContent = '➕ Add New Category...';
  select.appendChild(addOpt);

  document.getElementById('add-item-modal').style.display = 'flex';
}

function handleCategorySelectChange() {
  const select = document.getElementById('add-item-category-select');
  const newCategoryInput = document.getElementById('add-item-category-new');
  if (select.value === 'ADD_NEW') {
    newCategoryInput.style.display = 'block';
  } else {
    newCategoryInput.style.display = 'none';
  }
}

function closeAddItemModal() {
  document.getElementById('add-item-modal').style.display = 'none';
}

function saveNewItem() {
  const name = document.getElementById('add-item-name').value.trim();
  const price = parseInt(document.getElementById('add-item-price').value);
  
  let category = document.getElementById('add-item-category-select').value;
  if (category === 'ADD_NEW') {
    category = document.getElementById('add-item-category-new').value.trim();
  }
  if (!category) category = 'Specials';

  if (!name || isNaN(price) || price <= 0) {
    alert("Please enter a valid Name and Price.");
    return;
  }

  const newItem = {
    id: 'dish-' + Date.now(),
    category: category,
    name: name,
    price: price
  };

  activeMenuItems.push(newItem);
  if (db) db.ref('beta_menu_catalog').set(activeMenuItems);
  closeAddItemModal();
}

function openEditItemModal(id) {
  const item = activeMenuItems.find(i => i.id === id);
  if (!item) return;
  document.getElementById('edit-item-id').value = item.id;
  document.getElementById('edit-item-name').value = item.name;
  document.getElementById('edit-item-price').value = item.price;
  document.getElementById('edit-item-modal').style.display = 'flex';
}

function closeEditItemModal() {
  document.getElementById('edit-item-modal').style.display = 'none';
}

function saveEditedItem() {
  const id = document.getElementById('edit-item-id').value;
  const newName = document.getElementById('edit-item-name').value.trim();
  const newPrice = parseInt(document.getElementById('edit-item-price').value);

  if (!newName || isNaN(newPrice) || newPrice <= 0) {
    alert("Please enter a valid Name and Price.");
    return;
  }

  const itemIndex = activeMenuItems.findIndex(i => i.id === id);
  if (itemIndex > -1) {
    activeMenuItems[itemIndex].name = newName;
    activeMenuItems[itemIndex].price = newPrice;
    if (db) db.ref('beta_menu_catalog').set(activeMenuItems);
  }
  closeEditItemModal();
}

// ==========================================================================
// 7. KITCHEN DROPDOWN MENU
// ==========================================================================
function toggleKitchenMenuDropdown(forceState) {
  const dropdown = document.getElementById('kitchen-dropdown');
  const backdrop = document.getElementById('kitchen-dropdown-backdrop');
  if (!dropdown || !backdrop) return;

  const isOpen = dropdown.style.display === 'block';
  const shouldOpen = (typeof forceState === 'boolean') ? forceState : !isOpen;

  if (shouldOpen) {
    dropdown.style.display = 'block';
    backdrop.style.display = 'block';
  } else {
    dropdown.style.display = 'none';
    backdrop.style.display = 'none';
  }
}

// ==========================================================================
// 8. RENDER KITCHEN MENU
// ==========================================================================
function renderKitchenMenu() {
  const container = document.getElementById('kitchen-menu-container');
  if (!container) return;
  container.innerHTML = '';

  const searchQuery = (document.getElementById('kitchen-menu-search')?.value || '').toLowerCase();
  const filteredItems = activeMenuItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery) || item.category.toLowerCase().includes(searchQuery)
  );

  const checkedDishes = filteredItems.filter(d => kitchenCheckedState[d.id]);

  checkedDishes.forEach((dish) => {
    const isOOS = (kitchenCheckedState[dish.id] === 'OOS');
    const card = document.createElement('div');
    card.className = 'menu-card';
    card.setAttribute('data-item-id', dish.id);

    card.innerHTML = `
      <div class="dish-select-area">
        <input type="checkbox" class="dish-checkbox" id="chk-top-${dish.id}" checked onchange="toggleKitchenItem('${dish.id}', false)">
        <div class="dish-info">
          <h4>${dish.name} <span style="font-size:0.78rem; color:#777; font-weight:normal;">(${dish.category})</span></h4>
          <div class="price">₹${dish.price}</div>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
        <button type="button" class="btn-oos ${isOOS ? 'is-oos' : ''}" onclick="toggleOutOfStock('${dish.id}')">
          ${isOOS ? '🔴 Out of Stock' : '🟢 In Stock'}
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  const categories = [...new Set(filteredItems.map(item => item.category))];
  categories.forEach((cat) => {
    const uncheckedCatItems = filteredItems.filter(item => item.category === cat && !kitchenCheckedState[item.id]);

    if (uncheckedCatItems.length > 0) {
      const categoryHeader = document.createElement('h3');
      categoryHeader.style.cssText = "margin: 16px 0 6px 0; font-size: 0.95rem; color: #D9534F; border-bottom: 2px solid #EAEAEA; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;";
      categoryHeader.textContent = cat;
      container.appendChild(categoryHeader);

      uncheckedCatItems.forEach((dish) => {
        const card = document.createElement('div');
        card.className = 'menu-card';
        card.setAttribute('data-item-id', dish.id);

        card.innerHTML = `
          <div class="dish-select-area">
            <input type="checkbox" class="dish-checkbox" id="chk-${dish.id}" onchange="toggleKitchenItem('${dish.id}', true)">
            <div class="dish-info">
              <h4>${dish.name}</h4>
              <div class="price">₹${dish.price}</div>
            </div>
          </div>
          <button type="button" class="btn-edit-item" onclick="openEditItemModal('${dish.id}')">✏️ Edit</button>
        `;
        container.appendChild(card);
      });
    }
  });
}

function toggleKitchenItem(dishId, isChecked) {
  if (isChecked) {
    kitchenCheckedState[dishId] = true;
  } else {
    delete kitchenCheckedState[dishId];
  }
  renderKitchenMenu();
}

function toggleOutOfStock(dishId) {
  const current = kitchenCheckedState[dishId];
  const newState = (current === 'OOS') ? true : 'OOS';
  kitchenCheckedState[dishId] = newState;

  if (db) {
    db.ref(`beta_dailyMenu/${dishId}`).set(newState);
  }
  renderKitchenMenu();
}

// ==========================================================================
// 9. PUBLISH OR CLEAR DAILY LIVE MENU
// ==========================================================================
function publishDailyMenu() {
  if (!db) return alert("Database connection is not ready. Please refresh.");

  const selectedCount = Object.keys(kitchenCheckedState).length;

  if (selectedCount === 0) {
    if (confirm("No items selected. Do you want to clear all items from the customer's live menu page?")) {
      clearDailyMenu();
    }
    return;
  }

  const confirmMsg = `Are you sure you want to publish ${selectedCount} selected items to the BETA live customer menu?`;
  if (!confirm(confirmMsg)) return;

  db.ref('beta_dailyMenu').set(kitchenCheckedState)
    .then(() => {
      alert(`Beta Menu published successfully (${selectedCount} items)!`);
      sendRenderPushBroadcast(
        "Beta Menu Up! 🍛",
        `We just published ${selectedCount} items.`
      );
    })
    .catch((error) => console.error("Error publishing menu:", error));
}

function clearDailyMenu() {
  if (!db) return;
  if (confirm("Remove all items from the beta customer menu?")) {
    db.ref('beta_dailyMenu').remove()
      .then(() => {
        kitchenCheckedState = {};
        renderKitchenMenu();
        alert("All items removed!");
      })
      .catch((error) => console.error("Error clearing daily menu:", error));
  }
}

// ==========================================================================
// 10. CUSTOMER LIVE MENU LISTENER
// ==========================================================================
function renderCustomerMenuFromSnapshot(activeIds) {
  const container = document.getElementById('customer-menu-container');
  const placeOrderBtn = document.getElementById('btn-place-order');
  if (!container) return;

  container.innerHTML = '';

  if (isDuringBreakWindow()) {
    container.innerHTML = `
      <div style="text-align:center; padding: 40px 20px; color:#555;">
        <div style="font-size: 2.5rem; margin-bottom: 12px;">🌙</div>
        <h3 style="color:#D9534F; font-size: 1.15rem; margin-bottom: 8px;">We're Closed for the Day!</h3>
        <p style="font-size: 0.95rem; line-height: 1.5; color: #666;">
          Orders are now closed for today.<br>
          Tomorrow's live menu will be available starting at <strong>9:00 PM tonight</strong>!
        </p>
      </div>
    `;
    if (placeOrderBtn) placeOrderBtn.disabled = true;
    return;
  }

  if (placeOrderBtn) placeOrderBtn.disabled = false;

  if (!activeIds || Object.keys(activeIds).length === 0) {
    container.innerHTML = `<p style="text-align:center; padding: 40px 20px; color:#666;">The kitchen is preparing today's live menu. Please check back shortly!</p>`;
    return;
  }

  activeMenuItems.forEach((dish) => {
    if (activeIds[dish.id]) {
      cart[dish.id] = cart[dish.id] || 0;
      const isOOS = (activeIds[dish.id] === 'OOS');

      if (isOOS && cart[dish.id] > 0) cart[dish.id] = 0;

      const card = document.createElement('div');
      card.className = 'menu-card';
      card.setAttribute('data-item-id', dish.id);

      const actionAreaHtml = isOOS
        ? `<span class="badge-oos">Out of Stock</span>`
        : `<div class="quantity-stepper">
             <button type="button" aria-label="Decrease quantity" onclick="updateQuantity('${dish.id}', -1)">−</button>
             <span id="qty-${dish.id}">${cart[dish.id]}</span>
             <button type="button" aria-label="Increase quantity" onclick="updateQuantity('${dish.id}', 1)">+</button>
           </div>`;

      card.innerHTML = `
        <div class="dish-info" style="${isOOS ? 'opacity: 0.5;' : ''}">
          <h4>${dish.name}</h4>
          <div class="price">₹${dish.price}</div>
        </div>
        ${actionAreaHtml}
      `;
      container.appendChild(card);
    }
  });
}

function listenForCustomerLiveMenu() {
  if (!db) return;
  db.ref('beta_dailyMenu').on('value', (snapshot) => {
    latestFirebaseMenuSnapshot = snapshot.val();
    renderCustomerMenuFromSnapshot(latestFirebaseMenuSnapshot);
  });
}

function updateQuantity(dishId, change) {
  const currentQty = cart[dishId] || 0;
  let newQty = currentQty + change;
  if (newQty < 0) newQty = 0;
  if (newQty > 10) {
    alert("Quantity cap reached: Maximum 10 items per dish.");
    newQty = 10;
  }
  cart[dishId] = newQty;
  const qtySpan = document.getElementById(`qty-${dishId}`);
  if (qtySpan) qtySpan.textContent = newQty;
}

// ==========================================================================
// 11. ORDER SUBMISSION ENGINE
// ==========================================================================
let pendingCustomerOrder = null;

function openOrderOptionsModal() {
  if (isDuringBreakWindow()) {
    alert("Orders are closed for today. Tomorrow's menu will be available starting at 9:00 PM tonight!");
    return;
  }

  const orderItems = [];
  let totalAmount = 0;

  activeMenuItems.forEach((dish) => {
    const qty = cart[dish.id] || 0;
    if (qty > 0) {
      orderItems.push({ id: dish.id, name: dish.name, price: dish.price, quantity: qty });
      totalAmount += dish.price * qty;
    }
  });

  if (orderItems.length === 0) {
    alert("Please add at least one item to your order.");
    return;
  }

  const profileStr = localStorage.getItem('fp_beta_customer_profile');
  if (!profileStr) {
    checkAppOnboarding(); 
    return;
  }

  pendingCustomerOrder = {
    items: orderItems,
    total: totalAmount,
    profile: JSON.parse(profileStr)
  };
  
  document.getElementById('order-options-modal').style.display = 'flex';
}

function closeOrderOptionsModal() {
  document.getElementById('order-options-modal').style.display = 'none';
  pendingCustomerOrder = null;
}

async function finalizeOrderPlacement() {
  const orderType = document.getElementById('order-type-select').value;
  const scheduledTime = document.getElementById('order-time-input').value;

  if (!scheduledTime) {
    alert("Please select a preferred time for your order.");
    return;
  }

  document.getElementById('order-options-modal').style.display = 'none';
  
  let localPushSub = await getLocalPushSubscription();

  executeFirebaseOrderSubmission(
    pendingCustomerOrder.items, 
    pendingCustomerOrder.total, 
    pendingCustomerOrder.profile, 
    localPushSub,
    orderType,
    scheduledTime
  );
  
  pendingCustomerOrder = null;
}

function executeFirebaseOrderSubmission(orderItems, totalAmount, customerProfile, pushSub, orderType, scheduledTime) {
  const newOrderRef = db.ref('beta_orders').push();
  
  const orderData = {
    orderId: newOrderRef.key.slice(-4).toUpperCase(),
    items: orderItems,
    total: totalAmount,
    status: 'PENDING',
    customerName: customerProfile.name,
    customerMobile: customerProfile.mobile,
    customerVersion: CURRENT_APP_VERSION,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    orderType: orderType,          
    scheduledTime: scheduledTime,  
    deliveryCharge: 0              
  };

  if (pushSub && pushSub.endpoint) {
    orderData.pushSubscription = pushSub;
  }

  newOrderRef.set(orderData)
    .then(() => {
      notifyKitchenNewOrder(orderData);
      
      alert(`Order placed successfully! Your Order ID is #${orderData.orderId}`);
      
      const myOrder = {
        firebaseKey: newOrderRef.key,
        orderId: orderData.orderId,
        items: orderItems,
        total: totalAmount,
        status: 'PENDING',
        timestamp: Date.now(),
        orderType: orderType,
        scheduledTime: scheduledTime,
        deliveryCharge: 0
      };
      
      const pastOrders = JSON.parse(localStorage.getItem('fp_beta_customer_orders') || '[]');
      pastOrders.unshift(myOrder);
      localStorage.setItem('fp_beta_customer_orders', JSON.stringify(pastOrders));
      renderCustomerOrderHistory();

      activeMenuItems.forEach((dish) => { cart[dish.id] = 0; });
      Object.keys(cart).forEach(id => {
        const span = document.getElementById(`qty-${id}`);
        if (span) span.textContent = 0;
      });
      document.getElementById('order-time-input').value = "";
    })
    .catch((error) => {
      console.error("Error placing order:", error);
      alert("Failed to place order. Please check your internet connection.");
    });
}

function renderCustomerOrderHistory() {
  const container = document.getElementById('customer-orders-container');
  if (!container) return;

  const pastOrders = JSON.parse(localStorage.getItem('fp_beta_customer_orders') || '[]');

  if (pastOrders.length === 0) {
    container.innerHTML = `<p style="text-align:center; padding: 20px; color:#666;">No past orders yet. Orders placed from this device will appear here!</p>`;
    return;
  }

  container.innerHTML = '';

  pastOrders.forEach((myOrder) => {
    const card = document.createElement('div');
    card.className = 'customer-order-card';

    const itemsSummary = myOrder.items
      .map(i => `<strong>${i.quantity}x</strong> ${i.name}`)
      .join(', ');

    const dateStr = new Date(myOrder.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    const typeEmoji = myOrder.orderType === 'Delivery' ? '🚚' : '🥡';
    const deliveryStr = `<div style="font-weight: 600; color: #1565C0; margin-top: 6px; font-size: 0.85rem; background: #E3F2FD; display: inline-block; padding: 3px 8px; border-radius: 6px;">
        ${typeEmoji} ${myOrder.orderType} @ ${myOrder.scheduledTime}
    </div>`;

    let totalDisplay = `₹${myOrder.total}`;
    if (myOrder.deliveryCharge > 0) {
      totalDisplay += ` <span style="font-size:0.75rem; font-weight:normal; color:#666;">(includes ₹${myOrder.deliveryCharge} delivery fee)</span>`;
    }

    card.innerHTML = `
      <div class="customer-order-header">
        <div style="display: flex; flex-direction: column;">
          <span style="font-weight: 700; font-size: 0.95rem; color: #2D2D2D;">${dateStr}</span>
          <span style="font-size: 0.75rem; color: #888; margin-top: 2px;">Order ID: #${myOrder.orderId}</span>
        </div>
        <span class="status-badge status-${myOrder.status}">${myOrder.status}</span>
      </div>
      <p style="font-size: 0.88rem; color: #444; margin-bottom: 4px; line-height: 1.4;">${itemsSummary}</p>
      ${deliveryStr}
      <div style="font-weight: 700; color: #D9534F; font-size: 0.95rem; margin-top: 8px;">Total: ${totalDisplay}</div>
    `;

    container.appendChild(card);
  });
}

function clearCustomerHistory() {
  if (confirm("Clear your order history from this device?")) {
    localStorage.removeItem('fp_beta_customer_orders');
    renderCustomerOrderHistory();
  }
}

function listenForCustomerOrderUpdates() {
  if (!db) return;

  db.ref('beta_orders').on('value', (snapshot) => {
    const activeOrders = snapshot.val() || {};
    const pastOrders = JSON.parse(localStorage.getItem('fp_beta_customer_orders') || '[]');
    let hasChanges = false;

    pastOrders.forEach((myOrder) => {
      const liveOrder = activeOrders[myOrder.firebaseKey];
      if (liveOrder) {
        if (myOrder.status !== liveOrder.status || myOrder.total !== liveOrder.total) {
          myOrder.status = liveOrder.status;
          myOrder.total = liveOrder.total;
          myOrder.deliveryCharge = liveOrder.deliveryCharge || 0;
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      localStorage.setItem('fp_beta_customer_orders', JSON.stringify(pastOrders));
      renderCustomerOrderHistory();
    }
  });
}

// ==========================================================================
// 12. KITCHEN LOGIN & NAVIGATION
// ==========================================================================
const KITCHEN_PIN = "validatefoodies2026";
let isKitchenMode = false;

function openKitchenPINModal() {
  if (localStorage.getItem('fp_beta_kitchen_auth') === 'true') {
    enterKitchenMode();
    return;
  }
  document.getElementById('pin-modal').style.display = 'flex';
  const input = document.getElementById('kitchen-pin-input');
  if (input) { input.value = ''; input.type = 'password'; }
}

function closePINModal() {
  document.getElementById('pin-modal').style.display = 'none';
}

function togglePasscodeVisibility() {
  const input = document.getElementById('kitchen-pin-input');
  const eyeBtn = document.getElementById('toggle-passcode-eye');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (eyeBtn) eyeBtn.textContent = '🔒';
  } else {
    input.type = 'password';
    if (eyeBtn) eyeBtn.textContent = '👁️';
  }
}

function verifyKitchenPIN() {
  const inputPin = document.getElementById('kitchen-pin-input').value;
  if (inputPin === KITCHEN_PIN) {
    localStorage.setItem('fp_beta_kitchen_auth', 'true');
    closePINModal();
    enterKitchenMode();
  } else {
    alert("Incorrect passcode. Access denied.");
  }
}

function enterKitchenMode() {
  if (!isKitchenMode) history.pushState({ kitchenMode: true }, '', '#kitchen');
  isKitchenMode = true;

  document.getElementById('main-app-title').style.display = 'none';
  document.getElementById('customer-view').style.display = 'none';

  document.getElementById('header-notify-btn').style.display = 'none';
  document.getElementById('header-kitchen-btn').style.display = 'none';
  document.getElementById('header-back-btn').style.display = 'inline-flex';
  
  document.getElementById('header-drawer-btn').style.display = 'inline-block';
  document.getElementById('kitchen-version-badge').style.display = 'inline-block';

  document.getElementById('kitchen-view').style.display = 'flex';
  
  checkAppOnboarding();
  syncKitchenPushSubscription();

  if (db) {
    db.ref('beta_dailyMenu').on('value', (snapshot) => {
      kitchenCheckedState = snapshot.val() || {};
      renderKitchenMenu();
    });
  } else {
    renderKitchenMenu();
  }

  listenForKitchenOrders();
}

function handleHeaderBack() {
  toggleKitchenMenuDropdown(false);
  const custPage = document.getElementById('customer-data-view');
  const payPage = document.getElementById('payment-details-view');
  const ordersPage = document.getElementById('kitchen-orders-view');
  
  if ((custPage && custPage.style.display === 'flex') || 
      (payPage && payPage.style.display === 'flex') || 
      (ordersPage && ordersPage.style.display === 'flex')) {
    closeKitchenSubPage(true);
  } else {
    exitKitchenMode(true);
  }
}

function exitKitchenMode(triggerHistoryBack = true) {
  if (!isKitchenMode) return;
  isKitchenMode = false;

  toggleKitchenMenuDropdown(false);
  closeKitchenSubPage(false);
  if (triggerHistoryBack && window.location.hash.startsWith('#kitchen')) history.back();

  document.getElementById('main-app-title').style.display = 'block';
  document.getElementById('kitchen-view').style.display = 'none';
  document.getElementById('customer-view').style.display = 'flex';

  document.getElementById('header-notify-btn').style.display = 'inline-flex';
  document.getElementById('header-kitchen-btn').style.display = 'inline-block';
  document.getElementById('header-back-btn').style.display = 'none';
  
  document.getElementById('header-drawer-btn').style.display = 'none';
  document.getElementById('kitchen-version-badge').style.display = 'none';
  
  checkAppOnboarding();

  if (db) {
    db.ref('beta_orders').off();
    db.ref('beta_dailyMenu').off();
  }
}

// ==========================================================================
// 13. DEDICATED KITCHEN SUB-PAGES
// ==========================================================================
function openKitchenOrdersPage() {
  toggleKitchenMenuDropdown(false);
  history.pushState({ kitchenSubPage: 'orders' }, '', '#kitchen-orders');
  document.getElementById('kitchen-view').style.display = 'none';
  document.getElementById('kitchen-orders-view').style.display = 'flex';
}

function openCustomerDataPage() {
  toggleKitchenMenuDropdown(false);
  history.pushState({ kitchenSubPage: 'customers' }, '', '#kitchen-customers');
  document.getElementById('kitchen-view').style.display = 'none';
  document.getElementById('customer-data-view').style.display = 'flex';
  fetchAndRenderCustomerDirectory();
}

function openPaymentDetailsPage() {
  toggleKitchenMenuDropdown(false);
  history.pushState({ kitchenSubPage: 'payments' }, '', '#kitchen-payments');
  document.getElementById('kitchen-view').style.display = 'none';
  document.getElementById('payment-details-view').style.display = 'flex';
  fetchAndRenderPaymentLedger();
}

function closeKitchenSubPage(triggerBack = true) {
  document.getElementById('customer-data-view').style.display = 'none';
  document.getElementById('payment-details-view').style.display = 'none';
  document.getElementById('kitchen-orders-view').style.display = 'none';
  if (isKitchenMode) document.getElementById('kitchen-view').style.display = 'flex';
  if (triggerBack && (window.location.hash === '#kitchen-customers' || window.location.hash === '#kitchen-payments' || window.location.hash === '#kitchen-orders')) {
    history.back();
  }
}

function clearPaymentLedger() {
  if (!db) return;
  if (confirm("Are you sure you want to wipe all billing records and order entries? This will reset the total ledger back to ₹0.")) {
    db.ref('beta_orders').remove()
      .then(() => {
        alert("Payment ledger wiped clean!");
        fetchAndRenderPaymentLedger();
      })
      .catch((err) => console.error("Error clearing payment ledger:", err));
  }
}

function fetchAndRenderCustomerDirectory() {
  const container = document.getElementById('customer-directory-container');
  if (!container || !db) return;

  container.innerHTML = `<p style="text-align:center; padding: 30px; color:#666;">Fetching live directory...</p>`;

  db.ref('beta_customers').once('value').then((snapshot) => {
    const customers = snapshot.val();
    if (!customers) {
      container.innerHTML = `<p style="text-align:center; padding: 30px; color:#666;">No customer version records synced yet.</p>`;
      return;
    }
    container.innerHTML = '';
    
    const customerArray = Object.values(customers).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
    
    customerArray.forEach((cust) => {
      const card = document.createElement('div');
      card.className = 'customer-data-card';
      const dateStr = cust.lastSeen ? new Date(cust.lastSeen).toLocaleDateString() : 'Recently';
      card.innerHTML = `
        <div>
          <h4 style="font-size:1.05rem; color:#2D2D2D; margin-bottom:3px;">${cust.name || 'Guest'}</h4>
          <div style="font-size:0.85rem; color:#666;">📞 <strong>${cust.mobile}</strong></div>
          <div style="font-size:0.75rem; color:#888; margin-top:2px;">Last Active: ${dateStr}</div>
        </div>
        <span class="version-badge">${cust.appVersion || 'Unknown'}</span>
      `;
      container.appendChild(card);
    });
  });
}

function fetchAndRenderPaymentLedger() {
  const container = document.getElementById('payment-ledger-container');
  if (!container || !db) return;

  container.innerHTML = `<p style="text-align:center; padding: 30px; color:#666;">Calculating payment ledger...</p>`;

  db.ref('beta_orders').once('value').then((snapshot) => {
    const orders = snapshot.val();
    if (!orders) {
      container.innerHTML = `
        <div class="payment-summary-box">
          <div style="font-size:0.85rem; color:#666; text-transform:uppercase; font-weight:700;">Active Orders Billing Total</div>
          <div style="font-size:1.8rem; font-weight:800; color:#D9534F; margin:4px 0;">₹0</div>
          <div style="font-size:0.85rem; color:#2E7D32;">✔ 0 Orders Accepted</div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin: 16px 0 10px 0;">
          <h3 style="font-size:1rem; color:#2D2D2D; margin: 0;">Recent Billing Entries</h3>
          <button type="button" class="btn-clear-menu" onclick="clearPaymentLedger()" style="padding: 6px 12px; font-size: 0.8rem; width: auto; flex: none;">🗑️ Clear Entries</button>
        </div>
        <p style="text-align:center; padding: 30px; color:#666;">No active payment records found today.</p>
      `;
      return;
    }

    let totalRevenue = 0;
    let completedCount = 0;
    const orderRows = Object.values(orders);

    orderRows.forEach((o) => {
      if (o.status === 'ACCEPTED') {
        totalRevenue += (o.total || 0);
        completedCount++;
      }
    });

    container.innerHTML = `
      <div class="payment-summary-box">
        <div style="font-size:0.85rem; color:#666; text-transform:uppercase; font-weight:700;">Active Orders Billing Total</div>
        <div style="font-size:1.8rem; font-weight:800; color:#D9534F; margin:4px 0;">₹${totalRevenue}</div>
        <div style="font-size:0.85rem; color:#2E7D32;">✔ ${completedCount} Orders Accepted</div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin: 16px 0 10px 0;">
        <h3 style="font-size:1rem; color:#2D2D2D; margin: 0;">Recent Billing Entries</h3>
        <button type="button" class="btn-clear-menu" onclick="clearPaymentLedger()" style="padding: 6px 12px; font-size: 0.8rem; width: auto; flex: none;">🗑️ Clear Entries</button>
      </div>
    `;

    orderRows.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0)).forEach((order) => {
      const row = document.createElement('div');
      row.className = 'customer-data-card';
      
      const dateStr = new Date(order.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      
      let totalDisplay = `₹${order.total}`;
      if (order.deliveryCharge > 0) {
        totalDisplay += ` (+ ₹${order.deliveryCharge} fee)`;
      }

      row.innerHTML = `
        <div style="flex: 1;">
          <div style="font-size:0.9rem; font-weight: 700; color:#2D2D2D;">${dateStr} <span style="font-weight: normal; color: #888; font-size: 0.75rem; margin-left: 4px;">(#${order.orderId})</span></div>
          <div style="font-size: 0.95rem; color: #D9534F; font-weight: 700; margin: 4px 0;">${totalDisplay}</div>
          <div style="font-size:0.8rem; color:#666;">👤 ${order.customerName || 'Guest'} (${order.customerMobile || 'N/A'})</div>
        </div>
        <span style="font-weight:700; font-size:0.85rem; color:#D9534F;">${order.status}</span>
      `;
      container.appendChild(row);
    });
  });
}

window.addEventListener('popstate', () => {
  if (isKitchenMode) {
    if (window.location.hash === '#kitchen') {
      closeKitchenSubPage(false);
    } else if (window.location.hash !== '#kitchen-customers' && window.location.hash !== '#kitchen-payments' && window.location.hash !== '#kitchen-orders') {
      exitKitchenMode(false);
    }
  }
});

// ==========================================================================
// 14. LIVE KITCHEN ORDER LISTENER
// ==========================================================================
function listenForKitchenOrders() {
  if (!db) return;
  const ordersContainer = document.getElementById('kitchen-orders-container');
  
  db.ref('beta_orders').on('value', (snapshot) => {
    if (!ordersContainer) return;
    ordersContainer.innerHTML = '';

    const orders = snapshot.val();
    if (!orders) {
      ordersContainer.innerHTML = `<p style="text-align:center; padding:20px; color:#666;">No active incoming orders.</p>`;
      return;
    }

    const ordersArray = Object.keys(orders).map(key => ({
      firebaseKey: key,
      ...orders[key]
    })).filter(order => !order.archived);

    if (ordersArray.length === 0) {
      ordersContainer.innerHTML = `<p style="text-align:center; padding:20px; color:#666;">No active incoming orders.</p>`;
      return;
    }

    ordersArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    ordersArray.forEach((order) => {
      const card = document.createElement('div');
      card.className = 'order-card';
      
      const itemsListHtml = order.items
        .map(i => `<p style="margin: 4px 0;"><strong>${i.quantity}x</strong> ${i.name}</p>`)
        .join('');

      const statusColors = {
        PENDING: '#EF6C00',
        ACCEPTED: '#2E7D32',
        REJECTED: '#C62828'
      };
      const statusColor = statusColors[order.status] || '#D9534F';

      const typeEmoji = order.orderType === 'Delivery' ? '🚚' : '🥡';
      const orderTypeHtml = `
        <div style="font-weight: 700; color: #1565C0; margin: 8px 0; background: #E3F2FD; display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 0.9rem;">
          ${typeEmoji} ${order.orderType} @ ${order.scheduledTime || 'N/A'}
        </div>
      `;

      let actionButtonsHtml = '';
      if (order.status === 'PENDING') {
        actionButtonsHtml = `
          <button class="btn-action btn-accept" onclick="acceptOrderTrigger('${order.firebaseKey}', '${order.orderType}', ${order.total})">Accept</button>
          <button class="btn-action btn-deny" onclick="rejectOrder('${order.firebaseKey}')">Reject</button>
        `;
      } else {
        actionButtonsHtml = `
          <button class="btn-action" style="background: #EAEAEA; color: #555;" onclick="removeTicket('${order.firebaseKey}')">Remove Ticket</button>
        `;
      }

      const dateStr = new Date(order.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      
      let totalDisplay = `₹${order.total}`;
      if (order.deliveryCharge > 0) {
        totalDisplay += ` <span style="font-size:0.8rem; font-weight:normal; color:#666;">(Includes ₹${order.deliveryCharge} fee)</span>`;
      }

      card.innerHTML = `
        <div class="order-header">
          <div>
            <div style="font-size: 0.95rem; font-weight: 700; color: #2D2D2D;">${dateStr}</div>
            <div style="font-size: 0.75rem; color: #888; margin-top: 2px;">Order ID: #${myOrder.orderId}</div>
            <div style="font-size: 0.85rem; color: #444; margin-top: 6px; font-weight: 500;">
              👤 <strong>${order.customerName || 'Guest'}</strong> (${order.customerMobile || 'N/A'})
            </div>
          </div>
          <span style="color: ${statusColor}; font-weight: 700;">${order.status}</span>
        </div>
        ${orderTypeHtml}
        <div class="order-body" style="margin: 6px 0 12px 0;">
          ${itemsListHtml}
          <p style="margin-top: 8px; font-weight: bold;">Total: ${totalDisplay}</p>
        </div>
        <div class="order-actions">
          ${actionButtonsHtml}
        </div>
      `;

      ordersContainer.appendChild(card);
    });
  });
}

// ==========================================================================
// 15. TARGETED ORDER ACTIONS
// ==========================================================================
let pendingAcceptance = null;

function acceptOrderTrigger(firebaseKey, orderType, currentTotal) {
  if (orderType === 'Delivery') {
    pendingAcceptance = { key: firebaseKey, originalTotal: currentTotal };
    document.getElementById('kitchen-delivery-fee-input').value = "";
    document.getElementById('delivery-charge-modal').style.display = 'flex';
  } else {
    processOrderAcceptance(firebaseKey, 0);
  }
}

function closeDeliveryChargeModal() {
  document.getElementById('delivery-charge-modal').style.display = 'none';
  pendingAcceptance = null;
}

function confirmDeliveryAcceptance() {
  const feeInput = document.getElementById('kitchen-delivery-fee-input').value;
  const charge = parseInt(feeInput) || 0;
  
  processOrderAcceptance(pendingAcceptance.key, charge);
  closeDeliveryChargeModal();
}

async function processOrderAcceptance(firebaseKey, deliveryCharge) {
  if (!db) return;
  try {
    const snap = await db.ref(`beta_orders/${firebaseKey}`).once('value');
    const order = snap.val();
    if (!order) return;

    const newTotal = order.total + deliveryCharge;

    await db.ref(`beta_orders/${firebaseKey}`).update({ 
      status: 'ACCEPTED',
      deliveryCharge: deliveryCharge,
      total: newTotal
    });
    
    const targetSub = await resolveTargetSubscription(order);
    if (targetSub) {
      let pushMessage = `Hi ${order.customerName}, your order #${order.orderId} has been accepted and will be ready at ${order.scheduledTime}! Total is ₹${newTotal}.`;
      if (deliveryCharge > 0) {
         pushMessage = `Hi ${order.customerName}, your order #${order.orderId} is accepted for ${order.scheduledTime}! Total is ₹${newTotal} (includes ₹${deliveryCharge} delivery fee).`;
      }
      sendTargetedRenderPush(targetSub, "Order Accepted ✅", pushMessage);
    }
  } catch (error) {
    console.error("Error accepting order:", error);
    alert("Could not update order status.");
  }
}

async function rejectOrder(firebaseKey) {
  if (!db) return;
  if (confirm("Reject this order? The customer will be notified.")) {
    try {
      await db.ref(`beta_orders/${firebaseKey}`).update({ status: 'REJECTED' });
      
      const snap = await db.ref(`beta_orders/${firebaseKey}`).once('value');
      const order = snap.val();
      if (order) {
        const targetSub = await resolveTargetSubscription(order);
        if (targetSub) {
          sendTargetedRenderPush(targetSub, "Order Rejected ❌", `Sorry ${order.customerName}, your order #${order.orderId} was declined by the kitchen.`);
        }
      }
    } catch (error) {
      console.error("Error rejecting order:", error);
      alert("Could not update order status.");
    }
  }
}

async function removeTicket(firebaseKey) {
  if (!db) return;
  try {
    await db.ref(`beta_orders/${firebaseKey}`).update({ archived: true });
  } catch (error) {
    console.error("Error removing ticket from screen:", error);
  }
}

// ==========================================================================
// 16. NON-INVASIVE UI SHIFT OBSERVER (GLOBAL WRAPPER METHOD)
// ==========================================================================
const adObserver = new MutationObserver(() => {
  let adFound = false;
  
  document.body.childNodes.forEach(child => {
    if (child.nodeType === 1) {
      const st = window.getComputedStyle(child);
      if ((st.position === 'fixed' || st.position === 'absolute') && parseInt(st.zIndex) > 1000 && st.top === '0px') {
        adFound = true;
        const adHeight = child.offsetHeight || 70;
        document.documentElement.style.setProperty('--ad-offset', `${adHeight}px`);
      }
    }
  });

  if (!adFound) {
    document.documentElement.style.setProperty('--ad-offset', '0px');
  }
});

document.addEventListener("DOMContentLoaded", () => {
  adObserver.observe(document.body, { childList: true });
});

// ==========================================================================
// 17. INITIALIZE APP ON DOM READY
// ==========================================================================
function initFoodiesPoint() {
  enforceInstallGate();
  checkDaily6PMReset();
  
  updateCustomerPresence();
  
  loadDynamicMenuCatalog();
  listenForCustomerLiveMenu();
  renderCustomerOrderHistory();
  listenForCustomerOrderUpdates();
  
  autoSyncPushToken();

  setInterval(() => {
    checkDaily6PMReset();
    if (!isKitchenMode && latestFirebaseMenuSnapshot) {
      renderCustomerMenuFromSnapshot(latestFirebaseMenuSnapshot);
    }
  }, 30000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFoodiesPoint);
} else {
  initFoodiesPoint();
}
