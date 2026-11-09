
const loginPage = document.getElementById("loginPage");
const appPage = document.getElementById("appPage");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");

const adminArea = document.getElementById("adminArea");
const roleLabel = document.getElementById("roleLabel");

let currentRole = null;
let serialPort = null;

async function api(action, extra = {}) {
    const response = await fetch("/.netlify/functions/auth", {
        method: action === "status" ? "GET" : "POST",
        credentials: "same-origin",
        headers: action === "status"
            ? {}
            : { "Content-Type": "application/json" },
        body: action === "status"
            ? undefined
            : JSON.stringify({ action, ...extra })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "حدث خطأ");
    }

    return data;
}

function showLogin() {
    appPage.hidden = true;
    loginPage.hidden = false;
    currentRole = null;
}

function showDashboard(role) {
    currentRole = role;

    loginPage.hidden = true;
    appPage.hidden = false;

    const isAdmin = role === "admin";

    adminArea.hidden = !isAdmin;

    roleLabel.textContent = isAdmin
        ? "حساب المدير"
        : "حساب المشاهدة";

    document.getElementById("welcomeTitle").textContent =
        isAdmin ? "لوحة إدارة المحطة" : "لوحة متابعة المحطة";

    document.getElementById("welcomeDescription").textContent =
        isAdmin
            ? "إدارة ومتابعة عمليات المترو"
            : "مشاهدة بيانات المحطة والعمليات فقط";
}

async function checkSession() {
    try {
        const data = await api("status");

        if (data.loggedIn) {
            showDashboard(data.role);
        } else {
            showLogin();
        }
    } catch (error) {
        showLogin();
        loginError.textContent = "تعذر التحقق من تسجيل الدخول";
    }
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    loginError.textContent = "";

    const password = document.getElementById("password").value;

    try {
        const data = await api("login", { password });

        document.getElementById("password").value = "";

        showDashboard(data.role);
    } catch (error) {
        loginError.textContent = error.message;
    }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
        await api("logout");
    } catch (error) {
        console.error(error);
    }

    await disconnectSerial();
    showLogin();
});

// USB SERIAL: ADMIN ONLY
document.getElementById("connectButton").addEventListener("click", async () => {
    if (currentRole !== "admin") return;

    if (!("serial" in navigator)) {
        document.getElementById("serialMessage").textContent =
            "استخدم Chrome أو Edge على الكمبيوتر.";
        return;
    }

    try {
        serialPort = await navigator.serial.requestPort();

        await serialPort.open({ baudRate: 9600 });

        document.getElementById("systemStatus").textContent = "متصل";
        document.getElementById("connectButton").disabled = true;
        document.getElementById("disconnectButton").disabled = false;

        document.getElementById("serialMessage").textContent =
            "تم فتح اتصال USB. لم تتم مزامنة البيانات بعد.";

    } catch (error) {
        document.getElementById("serialMessage").textContent =
            "تعذر الاتصال: " + error.message;
    }
});

async function disconnectSerial() {
    if (!serialPort) return;

    try {
        await serialPort.close();
    } catch (error) {
        console.error(error);
    }

    serialPort = null;

    document.getElementById("systemStatus").textContent = "غير متصل";
    document.getElementById("connectButton").disabled = false;
    document.getElementById("disconnectButton").disabled = true;

    document.getElementById("serialMessage").textContent =
        "تم قطع الاتصال";
}

document.getElementById("disconnectButton").addEventListener(
    "click",
    disconnectSerial
);

checkSession();
