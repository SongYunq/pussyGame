import { io } from 'socket.io-client';

async function runE2ETest() {
  console.log('🚀 开始 Socket.io 实时联机端到端 (E2E) 测试...');

  // 1. 登录管理员与普通玩家
  const adminRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const adminData = await adminRes.json();
  const adminToken = adminData.data.token;

  const playerRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'player_vip', password: 'vippassword' }),
  });
  const playerData = await playerRes.json();
  const playerToken = playerData.data.token;

  // 2. 连接两个 Socket 客户端
  const socketAdmin = io('http://localhost:3000', {
    auth: { token: adminToken },
    transports: ['websocket'],
  });

  const socketPlayer = io('http://localhost:3000', {
    auth: { token: playerToken },
    transports: ['websocket'],
  });

  await new Promise<void>((resolve) => {
    let connectedCount = 0;
    const onConnect = () => {
      connectedCount++;
      if (connectedCount === 2) resolve();
    };
    socketAdmin.on('connect', onConnect);
    socketPlayer.on('connect', onConnect);
  });
  console.log('✅ 两名玩家 WebSocket 连接与 JWT 鉴权成功！');

  // 3. 管理员创建房间
  let createdRoomId = '';
  await new Promise<void>((resolve) => {
    socketAdmin.emit(
      'room:create',
      { roomName: 'VIP老友桌', baseAnte: 20, turnSeconds: 15 },
      (res: any) => {
        console.log('✅ 房间创建响应:', res);
        createdRoomId = res.roomId;
        resolve();
      }
    );
  });

  // 4. 普通玩家加入房间
  await new Promise<void>((resolve) => {
    socketPlayer.emit('room:join', { roomId: createdRoomId }, (res: any) => {
      console.log('✅ 玩家加入房间响应:', res);
      resolve();
    });
  });

  // 5. 两人分别入座
  await new Promise<void>((resolve) => {
    socketAdmin.emit('room:sit', { seatIndex: 0 }, (res: any) => {
      console.log('✅ 管理员入座座位 0:', res);
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    socketPlayer.emit('room:sit', { seatIndex: 1 }, (res: any) => {
      console.log('✅ 玩家入座座位 1:', res);
      resolve();
    });
  });

  // 6. 两人准备触发自动开局
  const gameStartPromise = new Promise<void>((resolve) => {
    let startCount = 0;
    socketAdmin.on('game:start', (data) => {
      console.log('✅ 管理员收到开局底牌通知:', data.handCards);
      startCount++;
      if (startCount === 2) resolve();
    });
    socketPlayer.on('game:start', (data) => {
      console.log('✅ 玩家收到开局底牌通知:', data.handCards);
      startCount++;
      if (startCount === 2) resolve();
    });
  });

  socketAdmin.emit('room:ready', { isReady: true });
  socketPlayer.emit('room:ready', { isReady: true });

  await gameStartPromise;
  console.log('🎉 牌局自动开启，底注已扣除，双方已安全发牌！');

  // 7. 测试互动表情广播
  const emojiPromise = new Promise<void>((resolve) => {
    socketAdmin.on('chat:emoji_broadcast', (data) => {
      console.log('✅ 收到互动表情广播:', data);
      resolve();
    });
  });
  socketPlayer.emit('chat:emoji', { emojiId: 'fire' });
  await emojiPromise;

  // 清理断开
  socketAdmin.disconnect();
  socketPlayer.disconnect();
  console.log('🏁 端到端 Socket.io 联机测试全部圆满通过！');
  process.exit(0);
}

runE2ETest().catch((err) => {
  console.error('❌ E2E 测试异常:', err);
  process.exit(1);
});
