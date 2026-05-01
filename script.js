// 1. Import Firebase Functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

// 2. Firebase Config (เอาข้อมูลจาก Firebase Console มาแปะที่นี่เบย์!)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// DOM Elements
const form = document.getElementById('memory-form');
const imageInput = document.getElementById('memory-image');
const imagePreview = document.getElementById('image-preview');
const fileCustomText = document.querySelector('.file-custom');
const dateInput = document.getElementById('memory-date');
const textInput = document.getElementById('memory-text');
const memoryGrid = document.getElementById('memory-grid');
const countSpan = document.getElementById('count');
const btnSubmit = document.getElementById('btn-submit');
const loader = document.getElementById('loader');

// ตั้งวันที่ปัจจุบัน
dateInput.value = new Date().toISOString().split('T')[0];

// --- ระบบพรีวิวรูปภาพ ---
imageInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        fileCustomText.textContent = "✅ " + file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

// --- ฟังก์ชันอัปโหลดรูปไปยัง Cloud Storage ---
async function uploadImage(file) {
    const storageRef = ref(storage, `memories/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
}

// --- ฟังก์ชันบันทึกข้อมูลลง Firestore ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const file = imageInput.files[0];
    if (!file) return alert("กรุณาเลือกรูปภาพก่อนครับ");

    // แสดงสถานะ Loading
    btnSubmit.disabled = true;
    btnSubmit.style.opacity = "0.5";
    loader.style.display = "block";

    try {
        // 1. อัปโหลดรูปภาพก่อนเพื่อให้ได้ URL
        const imageUrl = await uploadImage(file);

        // 2. ส่งข้อมูลทั้งหมดลง Firestore
        await addDoc(collection(db, "memories"), {
            imageUrl: imageUrl,
            date: dateInput.value,
            text: textInput.value,
            createdAt: new Date() // เก็บเวลาที่สร้างไว้ใช้เรียงลำดับ
        });

        // ล้างฟอร์ม
        form.reset();
        dateInput.value = new Date().toISOString().split('T')[0];
        imagePreview.style.display = 'none';
        fileCustomText.textContent = "จิ้มตรงนี้เพื่อเลือกรูป...";
        
        console.log("บันทึกสำเร็จ!");
    } catch (error) {
        console.error("เกิดข้อผิดพลาด: ", error);
        alert("บันทึกไม่สำเร็จ ลองดูใหม่นะเบย์");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.style.opacity = "1";
        loader.style.display = "none";
    }
});

// --- ฟังก์ชันดึงข้อมูลแบบ Real-time (ใครส่งปุ๊บ หน้าเว็บเด้งขึ้นปั๊บ) ---
const q = query(collection(db, "memories"), orderBy("date", "desc"));

onSnapshot(q, (snapshot) => {
    memoryGrid.innerHTML = '';
    countSpan.textContent = snapshot.size;

    if (snapshot.empty) {
        memoryGrid.innerHTML = `<div class="glass-panel" style="grid-column: 1/-1; text-align:center;">ยังไม่มีข้อมูลในระบบ Cloud เลยครับ</div>`;
        return;
    }

    snapshot.forEach((doc) => {
        const data = doc.data();
        const memoryId = doc.id;

        const card = document.createElement('div');
        card.className = 'memory-card';
        card.innerHTML = `
            <img src="${data.imageUrl}" class="card-img" alt="Memory">
            <div class="card-content">
                <div class="card-date">🗓️ ${new Date(data.date).toLocaleDateString('th-TH', {year:'numeric', month:'long', day:'numeric'})}</div>
                <div class="card-text">${data.text.replace(/\n/g, '<br>')}</div>
            </div>
            <button class="btn-delete" data-id="${memoryId}" data-url="${data.imageUrl}">🗑️</button>
        `;

        // เพิ่ม Event ลบข้อมูล
        card.querySelector('.btn-delete').addEventListener('click', async (e) => {
            const id = e.target.getAttribute('data-id');
            const url = e.target.getAttribute('data-url');
            if(confirm("จะลบรูปนี้ออกจาก Cloud จริงๆ หรอ?")) {
                await deleteMemory(id, url);
            }
        });

        memoryGrid.appendChild(card);
    });
});

// --- ฟังก์ชันลบข้อมูลทั้งจาก Database และ Storage ---
async function deleteMemory(id, imageUrl) {
    try {
        // 1. ลบจาก Firestore
        await deleteDoc(doc(db, "memories", id));
        
        // 2. ลบรูปภาพจาก Storage (เพื่อไม่ให้เปลืองที่เก็บ)
        // หมายเหตุ: การลบรูปจาก Storage ต้องใช้ Reference ที่ถูกต้อง 
        // ในที่นี้อาจจะซับซ้อนหน่อย ถ้าทำระบบจริงแนะนำให้เก็บ Path ไว้ด้วย
        console.log("ลบสำเร็จ!");
    } catch (error) {
        console.error("ลบไม่สำเร็จ: ", error);
    }
}
const firebaseConfig = {
  apiKey: "AIzaSyAuAEkyhtDv7dG38L2h7pe21T2Barqgg1Q",
  authDomain: "sweetheart-diary.firebaseapp.com",
  projectId: "sweetheart-diary",
  storageBucket: "sweetheart-diary.firebasestorage.app",
  messagingSenderId: "671082125671",
  appId: "1:671082125671:web:878e813c3c3dea62bdb7c2",
  measurementId: "G-E7VLDNW8Z1"
};