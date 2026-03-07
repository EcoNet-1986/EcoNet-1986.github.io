import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getDatabase, ref, set, get, child, push, onValue, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

        const firebaseConfig = {
            apiKey: "AIzaSyCV8R0gETJdLjrnBRY3TAZ61AWRANLFApE",
            authDomain: "econet-2ff67.firebaseapp.com",
            databaseURL: "https://econet-2ff67-default-rtdb.europe-west1.firebasedatabase.app/", 
            projectId: "econet-2ff67"
        };

        const app = initializeApp(firebaseConfig);
        const db = getDatabase(app);

        let myId = "", myData = null, currentPath = "posts-public", selectedContactId = null;

        window.doLogin = async () => {
            const id = document.getElementById('login-id').value.trim();
            const mdp = document.getElementById('login-mdp').value;
            if(!id || !mdp) return;
            const snap = await get(child(ref(db), `utilisateurs/${id}`));
            if (snap.exists() && snap.val().mdp === mdp) {
                myId = id; myData = snap.val();
                localStorage.setItem('econet_user_id', id);
                startApp();
            } else alert("Erreur d'identifiants");
        };

        window.doSignup = async () => {
            const id = document.getElementById('signup-id').value.trim();
            const mdp = document.getElementById('signup-mdp').value;
            const role = document.getElementById('signup-role').value;
            const nom = prompt("Ton nom complet :");
            if(!id || !mdp || !nom) return;
            await set(ref(db, `utilisateurs/${id}`), {nom, mdp, role, enLigne: false});
            alert("Compte créé !");
            location.reload();
        };

        window.onload = () => {
            const saved = localStorage.getItem('econet_user_id');
            if(saved) {
                get(child(ref(db), `utilisateurs/${saved}`)).then(snap => {
                    if(snap.exists()){ myId = saved; myData = snap.val(); startApp(); }
                });
            }
        };

        function startApp() {
            set(ref(db, `utilisateurs/${myId}/enLigne`), true);
            onDisconnect(ref(db, `utilisateurs/${myId}/enLigne`)).set(false);
            
            // Afficher l'onglet Salle des Profs seulement si autorisé
            if(myData.role === 'professeur' || myData.role === 'directeur') {
                document.getElementById('tab-posts-staff').style.display = 'block';
            }
            // Afficher l'Espace Parents pour les Parents, Profs et le Directeur
			if(myData.role === 'parent' || myData.role === 'professeur' || myData.role === 'directeur') {
				document.getElementById('tab-posts-parents').style.display = 'block';
			}

            document.getElementById('prof-name').innerText = myData.nom;
			document.getElementById('prof-badge').innerHTML = `<span class="badge ${myData.role==='professeur'?'badge-prof':myData.role==='directeur'?'badge-dir':myData.role==='parent'?'badge-parent':'badge-eleve'}">${myData.role}</span>`;            
			document.getElementById('screen-login').style.display = 'none';
            document.getElementById('screen-app').style.display = 'block';
            switchMainTab('posts-public');
        }

        window.logout = () => {
            set(ref(db, `utilisateurs/${myId}/enLigne`), false);
            localStorage.removeItem('econet_user_id');
            location.reload();
        };

        window.switchMainTab = (path) => {
            // SÉCURITÉ : Bloque Elèves et Parents de la salle des profs
            if(path === 'posts-staff' && (myData.role === 'élève' || myData.role === 'parent')) { 
                alert("Accès réservé au personnel !"); return; 
            }

            // 1. ON ARRÊTE TOUTES LES ÉCOUTES PRÉCÉDENTES (très important)
            if (currentPath) {
                off(ref(db, currentPath));
            }

            currentPath = path;
            const isChat = (path === 'chat');
            
            // 2. MISE À JOUR DE L'INTERFACE
            document.getElementById('view-feed').style.display = isChat ? 'none' : 'block';
            document.getElementById('view-chat').style.display = isChat ? 'grid' : 'none';
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.getElementById('tab-'+path).classList.add('active');
            
            if(!isChat) {
                let canWrite = (path === 'posts-public') || 
                               (path === 'posts-parents' && myData.role !== 'élève') ||
                               (path === 'posts-exercises' && myData.role !== 'élève') || 
                               (path === 'posts-announcements' && myData.role === 'directeur') ||
                               (path === 'posts-staff' && (myData.role === 'professeur' || myData.role === 'directeur'));
                
                document.getElementById('editor-container').style.display = canWrite ? 'block' : 'none';
                
                // 3. ON NETTOIE LE CONTENU PHYSIQUE AVANT DE CHARGER LE NOUVEAU
                document.getElementById('feed-content').innerHTML = "";
                loadFeed(path);
            } else {
                loadContacts();
            }
        };

        function loadFeed(path) {
            const container = document.getElementById('feed-content');
            // Utilisation de onValue unique pour ce path
            onValue(ref(db, path), (snap) => {
                let html = "";
                const posts = [];
                snap.forEach(c => { posts.push(c.val()); });
                
                posts.reverse().forEach(p => {
                    const rClass = p.role === 'professeur' ? 'badge-prof' : p.role === 'directeur' ? 'badge-dir' : p.role === 'parent' ? 'badge-parent' : 'badge-eleve';
                    const special = (path === 'posts-announcements') ? 'announcement' : (path === 'posts-exercises') ? 'exercise' : (path === 'posts-staff') ? 'staff-only' : '';
                    
                    html += `<div class="post ${special}">
                        <strong>${p.name}</strong> <span class="badge ${rClass}">${p.role}</span>
                        <div style="margin-top:10px;">${render(p.text)}</div>
                    </div>`;
                });
                // On injecte le tout d'un coup. Si html est vide, on laisse vide.
                container.innerHTML = html;
            });
        }

        window.sendPost = () => {
            const val = document.getElementById('post-text').value;
            if(!val.trim()) return;
            push(ref(db, currentPath), { name: myData.nom, role: myData.role, text: val });
            document.getElementById('post-text').value = "";
        };

        window.sendPrivateMsg = () => {
            const val = document.getElementById('chat-input').value;
            if(!val.trim() || !selectedContactId) return;
            const chatId = myId < selectedContactId ? `${myId}_${selectedContactId}` : `${selectedContactId}_${myId}`;
            push(ref(db, `messages_prives/${chatId}`), { sender: myId, text: val });
            document.getElementById('chat-input').value = "";
        };

        window.handleFile = (input, targetId) => {
            const file = input.files[0];
            if(!file || file.size > 1000000) return alert("Max 1Mo");
            const reader = new FileReader();
            reader.onload = (e) => {
                const tag = file.type.startsWith('image') ? 'IMG' : 'VID';
                document.getElementById(targetId).value += ` [${tag}]${e.target.result}[/${tag}]`;
            };
            reader.readAsDataURL(file);
        };

        function render(text) {
            if(!text) return "";
            text = text.replace(/\[IMG\](.*?)\[\/IMG\]/g, '<img src="$1" class="media-preview">');
            text = text.replace(/\[VID\](.*?)\[\/VID\]/g, '<video src="$1" controls class="media-preview"></video>');
            return text;
        }

        
        window.sendPost = () => {
            const val = document.getElementById('post-text').value;
            if(!val.trim()) return;
            // On envoie à Firebase. Le "loadFeed" ci-dessus détectera l'ajout automatiquement
            push(ref(db, currentPath), { 
                name: myData.nom, 
                role: myData.role, 
                text: val,
                timestamp: Date.now() // Optionnel : pour un tri parfait
            });
            document.getElementById('post-text').value = "";
        };

        function loadContacts() {
            onValue(ref(db, 'utilisateurs'), (snap) => {
                const list = document.getElementById('contact-list');
                list.innerHTML = "";
                snap.forEach(c => {
                    if(c.key !== myId) {
                        const u = c.val();
						const rClass = u.role === 'professeur' ? 'badge-prof' : u.role === 'directeur' ? 'badge-dir' : u.role === 'parent' ? 'badge-parent' : 'badge-eleve';                        
						const div = document.createElement('div');
                        div.className = 'contact-item' + (selectedContactId === c.key ? ' active' : '');
                        div.innerHTML = `
                            <span class="status-dot" style="background:${u.enLigne?'var(--online)':'var(--offline)'}"></span> 
                            <div style="text-align:left">
                                <div>${u.nom}</div>
                                <span class="badge ${rClass}" style="margin:0; font-size:8px;">${u.role}</span>
                            </div>`;
                        div.onclick = () => selectContact(c.key, u.nom);
                        list.appendChild(div);
                    }
                });
            });
        }

        function selectContact(id, name) {
            selectedContactId = id; 
            document.getElementById('chat-header').innerText = name;
            const chatId = myId < id ? `${myId}_${id}` : `${id}_${myId}`;
            onValue(ref(db, `messages_prives/${chatId}`), (snap) => {
                const box = document.getElementById('chat-messages'); box.innerHTML = "";
                snap.forEach(mSnap => {
                    const m = mSnap.val();
                    const div = document.createElement('div');
                    div.className = m.sender === myId ? 'msg msg-me' : 'msg msg-them';
                    div.innerHTML = render(m.text);
                    box.appendChild(div);
                });
                box.scrollTop = box.scrollHeight;
            });
            loadContacts();
        }

        window.toggleProfile = () => {
            const m = document.getElementById('modal-profile');
            const o = document.getElementById('overlay');
            const show = m.style.display === 'none';
            m.style.display = show ? 'block' : 'none';
            o.style.display = show ? 'block' : 'none';
        };
        window.showSignup = () => { document.getElementById('screen-login').style.display='none'; document.getElementById('screen-signup').style.display='block'; };
        window.showLogin = () => { document.getElementById('screen-signup').style.display='none'; document.getElementById('screen-login').style.display='block'; };
   
