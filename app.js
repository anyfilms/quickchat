// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const nextBtn = document.getElementById('nextBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const onlineCount = document.getElementById('onlineCount');
const chatCount = document.getElementById('chatCount');

// Socket.io connection
const socket = io();

// WebRTC variables
let peer = null;
let localStream = null;
let remoteStream = null;
let partnerId = null;
let isConnected = false;

// Initialize
init();

function init() {
    setupEventListeners();
    updateOnlineUsers();
    setupWebRTC();
}

function setupEventListeners() {
    startBtn.addEventListener('click', startChat);
    stopBtn.addEventListener('click', stopChat);
    disconnectBtn.addEventListener('click', disconnectChat);
    nextBtn.addEventListener('click', nextPartner);
    
    // Socket events
    socket.on('connected', handleConnected);
    socket.on('partnerFound', handlePartnerFound);
    socket.on('searching', handleSearching);
    socket.on('signal', handleSignal);
    socket.on('partnerDisconnected', handlePartnerDisconnected);
    socket.on('userCount', updateOnlineUsers);
}

async function setupWebRTC() {
    try {
        // Local media stream
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Local video placeholder को hide करें
        document.getElementById('localVideoPlaceholder').style.display = 'none';
        
        // PeerJS initialization
        peer = new Peer({
            host: 'localhost',
            port: 3000,
            path: '/peerjs',
            debug: 3
        });
        
        peer.on('open', (id) => {
            console.log('My peer ID is: ' + id);
        });
        
        peer.on('call', (call) => {
            call.answer(localStream);
            call.on('stream', (remoteStream) => {
                // Remote video display
                handleRemoteStream(remoteStream);
            });
        });
        
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('कैमरा/माइक्रोफोन एक्सेस करने में त्रुटि। कृपया परमिशन दें।');
    }
}

function startChat() {
    if (!localStream) {
        alert('कृपया पहले कैमरा/माइक्रोफोन की परमिशन दें।');
        return;
    }
    
    updateStatus('searching', 'साथी ढूंढ रहे हैं...');
    
    const interests = Array.from(document.querySelectorAll('.interest-tag.active'))
        .map(tag => tag.textContent);
    
    socket.emit('join', {
        interests: interests,
        timestamp: new Date().toISOString()
    });
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    disconnectBtn.disabled = true;
    nextBtn.disabled = true;
}

function stopChat() {
    socket.emit('disconnect');
    updateStatus('disconnected', 'डिस्कनेक्टेड');
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    disconnectBtn.disabled = true;
    nextBtn.disabled = true;
    
    // Reset UI
    document.getElementById('remoteVideoPlaceholder').innerHTML = `
        <i class="fas fa-user-friends"></i>
        <p>साथी की प्रतीक्षा कर रहे हैं...</p>
    `;
    document.getElementById('remoteVideoPlaceholder').style.display = 'flex';
}

function disconnectChat() {
    if (partnerId) {
        socket.emit('nextPartner');
        handlePartnerDisconnected();
    }
}

function nextPartner() {
    if (isConnected) {
        socket.emit('nextPartner');
        updateStatus('searching', 'नया साथी ढूंढ रहे हैं...');
        
        disconnectBtn.disabled = true;
        nextBtn.disabled = true;
        
        // Reset remote video
        document.getElementById('remoteVideoPlaceholder').innerHTML = `
            <i class="fas fa-user-friends"></i>
            <p>नया साथी ढूंढ रहे हैं...</p>
        `;
        document.getElementById('remoteVideoPlaceholder').style.display = 'flex';
    }
}

// Socket event handlers
function handleConnected(data) {
    console.log('Connected to server with ID:', data.userId);
    socket.emit('findMatch');
}

function handlePartnerFound(data) {
    partnerId = data.partnerId;
    updateStatus('connecting', 'साथी से जोड़ रहे हैं...');
    
    // WebRTC call initiate
    if (peer && localStream) {
        const call = peer.call(partnerId, localStream);
        call.on('stream', (remoteStream) => {
            handleRemoteStream(remoteStream);
        });
    }
    
    setTimeout(() => {
        updateStatus('connected', 'कनेक्टेड');
        isConnected = true;
        disconnectBtn.disabled = false;
        nextBtn.disabled = false;
    }, 1000);
}

function handleSearching(data) {
    updateStatus('searching', data.message);
}

function handleSignal(data) {
    // WebRTC signaling data handle
    if (peer) {
        // PeerJS automatically handles signaling
    }
}

function handlePartnerDisconnected() {
    updateStatus('disconnected', 'साथी डिस्कनेक्ट हो गया');
    
    partnerId = null;
    isConnected = false;
    disconnectBtn.disabled = true;
    nextBtn.disabled = true;
    
    document.getElementById('remoteVideoPlaceholder').innerHTML = `
        <i class="fas fa-user-friends"></i>
        <p>साथी डिस्कनेक्ट हो गया। नया साथी ढूंढें...</p>
    `;
    document.getElementById('remoteVideoPlaceholder').style.display = 'flex';
}

function handleRemoteStream(stream) {
    remoteStream = stream;
    
    // Create video element
    const remoteVideo = document.createElement('video');
    remoteVideo.srcObject = stream;
    remoteVideo.autoplay = true;
    remoteVideo.playsinline = true;
    remoteVideo.style.width = '100%';
    remoteVideo.style.height = '100%';
    remoteVideo.style.objectFit = 'cover';
    
    // Replace placeholder with video
    const placeholder = document.getElementById('remoteVideoPlaceholder');
    placeholder.innerHTML = '';
    placeholder.appendChild(remoteVideo);
    placeholder.style.display = 'block';
}

function updateStatus(status, text) {
    statusText.textContent = text;
    
    // Remove all classes
    statusDot.classList.remove('connected', 'searching', 'connecting');
    
    // Add appropriate class
    if (status === 'connected') {
        statusDot.classList.add('connected');
    } else if (status === 'searching') {
        statusDot.classList.add('searching');
    } else if (status === 'connecting') {
        statusDot.classList.add('searching'); // Same animation
    }
}

function updateOnlineUsers(data) {
    if (data && data.count) {
        onlineCount.textContent = data.count.toLocaleString();
        chatCount.textContent = Math.floor(data.count / 2.5).toLocaleString();
    }
}

// Stats update simulation (fallback)
setInterval(() => {
    if (!socket.connected) {
        const current = parseInt(onlineCount.textContent.replace(/,/g, ''));
        const change = Math.floor(Math.random() * 21) - 10;
        onlineCount.textContent = Math.max(10000, current + change).toLocaleString();
        
        const chatCurrent = parseInt(chatCount.textContent.replace(/,/g, ''));
        const chatChange = Math.floor(Math.random() * 11) - 5;
        chatCount.textContent = Math.max(5000, chatCurrent + chatChange).toLocaleString();
    }
}, 5000);