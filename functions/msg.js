export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.MSG_KV; // 你的KV绑定名称保持 MSG_KV 不变！
  if(request.method === 'GET'){
    const raw = await kv.get('msg_list', 'json');
    return Response.json(raw || []);
  }
  if(request.method === 'POST'){
    const body = await request.json();
    const list = await kv.get('msg_list','json') || [];
    const newItem = {
      name: body.name,
      content: body.content,
      time: new Date().toLocaleString('zh-CN')
    };
    list.unshift(newItem);
    // 写入KV
    await kv.put('msg_list', JSON.stringify(list));
    // ✅ 解决KV延迟：写完短暂等待再返回（大幅减少手机端写完读旧数据）
    await new Promise(r=>setTimeout(r,600));
    return Response.json({ok:true});
  }
  return Response.json({ok:false,msg:"方法错误"},{status:405})
}
