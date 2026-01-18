const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// स्टोरेज (प्रोडक्शन में डेटाबेस इस्तेमाल करें)
const users = {};
const waitingUsers = [];
const activePairs = {};

// स्टेटिक फाइलें सर्व करें
app.use(express.static(path.join(__dirname, 'public')));

// मुख्य रूट
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// सॉकेट इवेंट हैंडलिंग
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);
    
    // यूजर ज्वाइन करता है
    socket.on('join', (userData) => {
        users[socket.id] = {
            id: socket.id,
            ...userData,
            interests: userData.interests || []
        };
        
        socket.emit('connected', { userId: socket.id });
        
        // अन्य यूजर्स को नोटिफाई करें
        socket.broadcast.emit('userCount', { count: Object.keys(users).length });
        
        // ऑटोमेटिक मिलान शुरू करें
        findMatch(socket.id);
    });
    
    // यूजर मिलान ढूंढ रहा है
    socket.on('findMatch', () => {
        findMatch(socket.id);
    });
    
    // सिग्नलिंग डेटा भेजें
    socket.on('signal', (data) => {
        if (data.to) {
            io.to(data.to).emit('signal', {
                from: socket.id,
                signal: data.signal
            });
        }
    });
    
    // मैसेज भेजें
    socket.on('sendMessage', (data) => {
        if (data.to) {
            io.to(data.to).emit('receiveMessage', {
                from: socket.id,
                message: data.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // यूजर डिस्कनेक्ट होता है
    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            // यदि पेअर में है तो पार्टनर को नोटिफाई करें
            if (activePairs[socket.id]) {
                const partnerId = activePairs[socket.id];
                io.to(partnerId).emit('partnerDisconnected');
                delete activePairs[partnerId];
            }
            
            delete activePairs[socket.id];
            delete users[socket.id];
            
            // वेटिंग लिस्ट से हटाएं
            const waitingIndex = waitingUsers.indexOf(socket.id);
            if (waitingIndex !== -1) {
                waitingUsers.splice(waitingIndex, 1);
            }
            
            // यूजर काउंट अपडेट करें
            io.emit('userCount', { count: Object.keys(users).length });
            
            console.log('User disconnected:', socket.id);
        }
    });
    
    // अगला पार्टनर ढूंढें
    socket.on('nextPartner', () => {
        if (activePairs[socket.id]) {
            const partnerId = activePairs[socket.id];
            io.to(partnerId).emit('partnerDisconnected');
            delete activePairs[partnerId];
            delete activePairs[socket.id];
            
            // नया मिलान ढूंढें
            setTimeout(() => {
                findMatch(socket.id);
                findMatch(partnerId);
            }, 500);
        }
    });
});

// यूजर मिलान फंक्शन
function findMatch(userId) {
    // यदि पहले से किसी के साथ जुड़ा है
    if (activePairs[userId]) return;
    
    // वेटिंग लिस्ट में है
    if (waitingUsers.includes(userId)) return;
    
    // वेटिंग लिस्ट में जोड़ें
    waitingUsers.push(userId);
    
    // मिलान ढूंढें
    setTimeout(() => {
        const userIndex = waitingUsers.indexOf(userId);
        if (userIndex === -1) return;
        
        // दूसरा यूजर ढूंढें
        for (let i = 0; i < waitingUsers.length; i++) {
            if (i !== userIndex && waitingUsers[i] !== userId) {
                const partnerId = waitingUsers[i];
                
                // दोनों को कनेक्ट करें
                io.to(userId).emit('partnerFound', { partnerId });
                io.to(partnerId).emit('partnerFound', { partnerId: userId });
                
                // एक्टिव पेअर में जोड़ें
                activePairs[userId] = partnerId;
                activePairs[partnerId] = userId;
                
                // वेटिंग लिस्ट से हटाएं
                waitingUsers.splice(Math.max(userIndex, i), 1);
                waitingUsers.splice(Math.min(userIndex, i), 1);
                
                return;
            }
        }
        
        // कोई पार्टनर नहीं मिला
        io.to(userId).emit('searching', { message: 'साथी ढूंढ रहे हैं...' });
    }, 1000);
}

// सर्वर स्टार्ट करें
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});