import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, child, push, onValue, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCV8R0gETJdLjrnBRY3TAZ61AWRANLFApE",
    authDomain: "econet-2ff67.firebaseapp.com",
    databaseURL: "https://econet-2ff67-default-rtdb.europe-west1.firebasedatabase.app/", 
    projectId: "econet-2ff67"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let myId = "", myData = null, currentPath = "posts-public", selectedContactId = null;

// --- CONNEXION AUTOMATIQUE ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // L'utilisateur est déjà connecté avec Google
        const snap = await get(child(ref(db), `utilisateurs/${user.uid}`));
        if (snap.exists()) {
            myId = user.uid;
            myData = snap.val();
            startApp(); // Démarre l'application
        } else {
            // Première connexion, utilisateur Google existant mais pas encore dans la DB
            document.getElementById('screen-login').style.display = 'block';
            document.getElementById('screen-app').style.display = 'none';
        }
    } else {
        // Utilisateur pas connecté, afficher écran login
        document.getElementById('screen-login').style.display = 'block';
        document.getElementById('screen-app').style.display = 'none';
    }
});

// --- BOUTON CONNEXION GOOGLE ---
window.doLogin = async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Vérifie si l'utilisateur existe déjà
        const snapUser = await get(child(ref(db), `utilisateurs/${user.uid}`));
        let roleChoisi;

        if (!snapUser.exists()) {
            // Premier passage : demander le rôle
            const rolesValides = ["eleve", "parent", "professeur", "directeur"];
            roleChoisi = "";

            while(!rolesValides.includes(roleChoisi)){
                roleChoisi = prompt("Quel est ton rôle ? (eleve, parent, professeur, directeur)");
                if(roleChoisi){
                    roleChoisi = roleChoisi.toLowerCase().trim();
                }
                if(!rolesValides.includes(roleChoisi)){
                    alert("Veuillez écrire seulement : eleve, parent, professeur ou directeur.");
                }
            }

            // Si ce n'est pas un élève, vérifier le code dans Firebase
            if(roleChoisi !== "eleve") {
                const snapCodes = await get(ref(db, `codes/${roleChoisi}`));
                const codeCorrect = snapCodes.exists() ? snapCodes.val() : null;

                let codeValide = prompt(`Entrez le code pour ${roleChoisi}`);
                if(codeValide !== codeCorrect){
                    alert("Code incorrect ! Vous ne pouvez pas créer ce compte.");
                    await signOut(auth); // déconnecte l'utilisateur Google
                    return; // stoppe la création du compte
                }
            }

            // Création du compte
            myData = {
                nom: user.displayName,
                role: roleChoisi,
                enLigne: true,
                email: user.email
            };
            await set(ref(db, `utilisateurs/${user.uid}`), myData);

        } else {
            myData = snapUser.val();
        }

        myId = user.uid;
        startApp();

    } catch(err) {
        alert("Erreur : " + err.message);
    }
};

window.logout = () => {
    set(ref(db, `utilisateurs/${myId}/enLigne`), false);
    signOut(auth).then(() => location.reload());
};

// --- DÉMARRAGE APP ---
function startApp() {
    set(ref(db, `utilisateurs/${myId}/enLigne`), true);
    onDisconnect(ref(db, `utilisateurs/${myId}/enLigne`)).set(false);
    
    // Affichage selon rôle
    if (myData.role === 'professeur' || myData.role === 'directeur') document.getElementById('tab-posts-staff').style.display = 'block';
    if (['parent', 'professeur', 'directeur'].includes(myData.role)) document.getElementById('tab-posts-parents').style.display = 'block';

    document.getElementById('prof-name').innerText = myData.nom;
    document.getElementById('prof-badge').innerHTML = `<span class="badge badge-${myData.role}">${myData.role}</span>`;
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('screen-app').style.display = 'block';
    switchMainTab('posts-public');
}

// --- NAVIGATION ---
window.switchMainTab = (path) => {
    // ... tes vérifications de rôle existantes ...
    
    currentPath = path;
    
    // Mise à jour visuelle des onglets
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-'+path).classList.add('active');

    if (path !== 'chat') {
        loadFeed(path); // <--- C'est cet appel qui va tout déclencher
    } else {
        loadContacts();
    }
    // À ajouter à la fin de window.switchMainTab
    get(ref(db, `utilisateurs/${myId}/salons_masques/${path}`)).then(snap => {
        const btn = document.getElementById('btn-mute'); // Assure-toi que l'ID existe dans ton HTML
        if(btn) {
            btn.innerText = snap.exists() ? "🚫" : "👁️";
            btn.style.opacity = snap.exists() ? "0.5" : "1";
        }
    });
};

async function loadFeed(path) {
    const feedDiv = document.getElementById('feed-content');
    const editor = document.getElementById('editor-container');
    
    // 1. ARRÊTER l'écoute précédente pour éviter les conflits
    off(ref(db, path));

    // 2. VÉRIFIER LE MASQUAGE
    const snapMute = await get(ref(db, `utilisateurs/${myId}/salons_masques/${path}`));
    
    if (snapMute.exists()) {
        // AFFICHAGE MODE MASQUÉ
        feedDiv.innerHTML = `
            <div style="text-align:center; padding:50px; color:#666; background:#f9f9f9; border-radius:15px; border: 2px dashed #ddd; margin:20px;">
                <p style="font-size:40px; margin-bottom:10px;">🔇</p>
                <p style="font-weight:bold;">Ce salon est masqué</p>
                <p style="font-size:13px; color:#999; margin-bottom:20px;">Vous ne recevrez plus de messages ici.</p>
                <button onclick="toggleMutePath('${path}')" class="btn btn-blue">Réactiver le salon</button>
            </div>`;
        editor.style.display = 'none';
        return; // On s'arrête là
    }

    // 3. SI NON MASQUÉ : Activer l'écouteur en temps réel
    editor.style.display = 'block'; // On remet l'éditeur
    onValue(ref(db, path), (snap) => {
        let html = "";
        snap.forEach(c => {
            const p = c.val();
            const postId = c.key;
            const canDelete = (p.senderId === myId || myData.role === 'directeur');
            const deleteBtn = canDelete ? `<span onclick="deleteMsg('${path}', '${postId}')" style="float:right; cursor:pointer; color:red;">🗑️</span>` : "";

            html = `<div class="post">
                        ${deleteBtn}
                        <strong>${escapeHTML(p.name)}</strong>
                        <span class="badge badge-${p.role}">${p.role}</span><br>
                        ${render(p.text)}
                    </div>` + html;
        });
        feedDiv.innerHTML = html || "<p style='text-align:center; color:#999; margin:20px;'>Aucun message pour le moment.</p>";
    });
}
window.sendPost = async () => {
    const val = document.getElementById('post-text').value;
    if (!val.trim()) return;

    try {
        // 1. On publie avec le senderId pour permettre la suppression ciblée
        await push(ref(db, currentPath), { 
            senderId: myId,      // <--- TRÈS IMPORTANT : ajoute cette ligne
            name: myData.nom, 
            role: myData.role, 
            text: val,
            timestamp: Date.now() 
        });

        document.getElementById('post-text').value = "";

        // 2. NETTOYAGE AUTOMATIQUE
        autoPurge(currentPath);

    } catch (e) {
        alert("Erreur : " + e.message);
    }
};
// --- CHAT ET PROFIL ---
// Remplace ta fonction toggleProfile par celle-ci
window.toggleProfile = async () => {
    const m = document.getElementById('modal-profile'), o = document.getElementById('overlay');
    const isHidden = m.style.display === 'none' || m.style.display === '';
    
    if (isHidden) {
        m.style.display = 'block';
        o.style.display = 'block';
        updatePrivacyList(); // Charge les blocages
    } else {
        m.style.display = 'none';
        o.style.display = 'none';
    }
};

// Fonction pour afficher les salons et contacts bloqués
async function updatePrivacyList() {
    const salonsList = document.getElementById('list-muted-salons');
    const contactsList = document.getElementById('list-muted-contacts');

    // 1. Charger les Salons
    const snapSalons = await get(ref(db, `utilisateurs/${myId}/salons_masques`));
    salonsList.innerHTML = "";
    if (snapSalons.exists()) {
        Object.keys(snapSalons.val()).forEach(path => {
            salonsList.innerHTML += `
                <div class="blocked-item">
                    <span>📍 ${path.replace('posts-', '')}</span>
                    <button class="btn-unblock" onclick="toggleMutePath('${path}')">Réactiver</button>
                </div>`;
        });
    } else { salonsList.innerHTML = "<span style='color:#999'>Aucun salon masqué.</span>"; }

    // 2. Charger les Contacts
    const snapContacts = await get(ref(db, `utilisateurs/${myId}/contacts_masques`));
    contactsList.innerHTML = "";
    if (snapContacts.exists()) {
        for (let contactId in snapContacts.val()) {
            const userSnap = await get(ref(db, `utilisateurs/${contactId}/nom`));
            contactsList.innerHTML += `
                <div class="blocked-item">
                    <span>👤 ${userSnap.val() || 'Inconnu'}</span>
                    <button class="btn-unblock" onclick="toggleMuteContact('${contactId}')">Réactiver</button>
                </div>`;
        }
    } else { contactsList.innerHTML = "<span style='color:#999'>Aucun contact masqué.</span>"; }
}

function render(text){
    text = escapeHTML(text); // nettoyer tout le texte utilisateur
    // À l'intérieur de ta fonction qui affiche les messages
    text = text.replace(/\[AUD\](.*?)\[\/AUD\]/g, (match, src) => {
        return `<div style="margin-top:10px;">
                    <audio src="${src}" controls style="width:100%; height:30px;"></audio>
                </div>`;
    });
    
    text = text.replace(/\[VID\](.*?)\[\/VID\]/g, (match, src) => {
        return `<video src="${src}" controls class="media-preview"></video>`;
    });

    return text;
}

window.handleFile = (input, targetId) => {
    const file = input.files[0];
    if(!file || file.size > 1000000) return alert("Fichier trop lourd (Max 1Mo)");
    const reader = new FileReader();
    reader.onload = (e) => {
        const tag = file.type.startsWith('image') ? 'IMG' : 'VID';
        document.getElementById(targetId).value += ` [${tag}]${e.target.result}[/${tag}]`;
    };
    reader.readAsDataURL(file);
};
// Fonction pour sécuriser tout texte contre XSS
function escapeHTML(text){
    const div = document.createElement('div');
    div.textContent = text;  // transforme tout en texte sûr
    return div.innerHTML;
}
function displayChatMessage(msg, msgId, chatId, isMe){
    // Le directeur ne peut supprimer QUE ses propres messages ici (isMe)
    const deleteBtn = isMe ? `<span onclick="deleteMsg('messages_prives/${chatId}', '${msgId}')" style="cursor:pointer; margin-left:10px; color:red; font-size:11px; opacity:0.7;">[Supprimer]</span>` : "";

    const htmlMsg = `<div class="msg ${isMe ? 'msg-me' : 'msg-them'}">
        <strong>${escapeHTML(msg.name)}</strong>: ${render(msg.text)}
        ${deleteBtn}
    </div>`;
    document.getElementById('chat-messages').innerHTML += htmlMsg;
}
// --- FONCTION POUR CHARGER LES CONTACTS ---
function loadContacts() {
    onValue(ref(db, 'utilisateurs'), async (snap) => {
        // On récupère tes blocages d'abord
        const myMutesSnap = await get(ref(db, `utilisateurs/${myId}/contacts_masques`));
        const myMutes = myMutesSnap.exists() ? myMutesSnap.val() : {};

        let html = "";
        snap.forEach(childSnap => {
            const user = childSnap.val();
            const userId = childSnap.key;

            // SI le contact n'est pas moi ET qu'il n'est pas masqué
            if (userId !== myId && !myMutes[userId]) { 
                const statusClass = user.enLigne ? 'online' : 'offline';
                html += `
                <div class="contact-item" style="display:flex; justify-content:space-between; align-items:center;">
                    <div onclick="selectContact('${userId}', '${user.nom}')" style="flex:1;">
                        <div class="status-dot" style="background: var(--${statusClass})"></div>
                        ${escapeHTML(user.nom)}
                    </div>
                    <button onclick="toggleMuteContact('${userId}')" style="background:none; border:none; cursor:pointer; font-size:12px;">🚫</button>
                </div>`;
            }
        });
        document.getElementById('contact-list').innerHTML = html;
    });
}

// --- FONCTION POUR SÉLECTIONNER UN CONTACT ---
window.selectContact = (id, nom) => {
    selectedContactId = id;
    document.getElementById('chat-header').innerText = "Chat avec " + nom;
    document.getElementById('chat-messages').innerHTML = "";
    
    const chatId = myId < id ? `${myId}_${id}` : `${id}_${myId}`;
    
    off(ref(db, `messages_prives/${chatId}`)); 
    onValue(ref(db, `messages_prives/${chatId}`), (snap) => {
        document.getElementById('chat-messages').innerHTML = "";
        snap.forEach(m => {
            const msg = m.val();
            const msgId = m.key; // On récupère la clé du message
            // On passe msgId et chatId à la fonction d'affichage
            displayChatMessage(msg, msgId, chatId, msg.senderId === myId);
        });
    });
};

// --- FONCTION POUR ENVOYER UN MESSAGE PRIVÉ ---
window.sendPrivateMsg = () => {
    const text = document.getElementById('chat-input').value;
    if (!text.trim() || !selectedContactId) return;
    
    const chatId = myId < selectedContactId ? `${myId}_${selectedContactId}` : `${selectedContactId}_${myId}`;
    
    push(ref(db, `messages_prives/${chatId}`), {
        senderId: myId,
        name: myData.nom,
        role: myData.role,
        text: text,
        timestamp: Date.now()
    });
    
    document.getElementById('chat-input').value = "";
};
async function autoPurge(path) {
    const postsRef = ref(db, path);
    // On récupère tous les messages du dossier actuel
    const snap = await get(postsRef);
    
    if (snap.exists()) {
        let entries = [];
        snap.forEach(child => {
            entries.push({ id: child.key, data: child.val() });
        });

        // Si on dépasse 30 messages
        if (entries.length > 30) {
            // On trie pour être sûr d'avoir les plus anciens en premier
            // (Même si Firebase le fait souvent par défaut avec les clés push)
            const toDelete = entries.length - 30;
            
            for (let i = 0; i < toDelete; i++) {
                // Suppression définitive du message trop vieux
                await set(ref(db, `${path}/${entries[i].id}`), null);
            }
            console.log(`Auto-Purge : ${toDelete} messages supprimés pour faire de la place.`);
        }
    }
}
let mediaRecorder;
let audioChunks = [];

window.toggleRecord = async () => {
    const status = document.getElementById('recording-status');
    const btn = document.getElementById('mic-btn');

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // On utilise un bitrate faible (16kbps) pour que le fichier soit MINUSCULE
            mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 16000 });
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64Audio = reader.result;
                    // On injecte le tag audio dans le champ de texte
                    document.getElementById('post-text').value += ` [AUD]${base64Audio}[/AUD]`;
                };
                status.style.display = 'none';
                btn.style.filter = "none";
            };

            mediaRecorder.start();
            status.style.display = 'inline';
            btn.style.filter = "drop-shadow(0 0 5px red)"; // Effet visuel "Enregistre"
        } catch (err) {
            alert("Microphone refusé ou non trouvé.");
        }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
};
window.deleteMsg = async (path, id) => {
    if (confirm("Supprimer ce message définitivement ?")) {
        try {
            await set(ref(db, `${path}/${id}`), null);
        } catch (e) {
            alert("Erreur de permission");
        }
    }
};
window.toggleMutePath = async (path) => {
    if(!path) return;
    const muteRef = ref(db, `utilisateurs/${myId}/salons_masques/${path}`);
    const snap = await get(muteRef);

    if (snap.exists()) {
        await set(muteRef, null); // On réactive
    } else {
        await set(muteRef, true); // On masque
    }
    
    // ON FORCE LE RECHARGEMENT DU SALON
    switchMainTab(path); 
};
window.toggleMuteContact = async (contactId) => {
    if (!contactId) return;
    
    const muteRef = ref(db, `utilisateurs/${myId}/contacts_masques/${contactId}`);
    const snap = await get(muteRef);

    if (snap.exists()) {
        await set(muteRef, null); // Débloquer le contact
        alert("Discussion réactivée !");
    } else {
        const confirmer = confirm("Masquer cette discussion ?");
        if (confirmer) {
            await set(muteRef, true); // Masquer le contact
        }
    }
    // On rafraîchit la liste des contacts pour appliquer le changement
    loadContacts(); 
    // On vide l'écran de chat
    document.getElementById('chat-messages').innerHTML = "";
    document.getElementById('chat-header').innerText = "Discussion masquée";
};
