export async function onRequest({env,request}){
  const key="msgboard"
  const cfgKey="msg_config"
  const ADMIN_NAME = "管理员"
  const ADMIN_PWD = "xiaojun99"

  const url = new URL(request.url)

  // ========== 读取配置 ==========
  if(url.pathname === "/config" && request.method === "GET"){
    const raw = await env.MSG.get(cfgKey)
    return Response.json(raw ? JSON.parse(raw) : {max:30})
  }
  // ========== 修改配置（仅管理员） ==========
  if(url.pathname === "/config" && request.method === "PUT"){
    const body = await request.json()
    const {nick,text,max} = body
    if(nick !== ADMIN_NAME || text !== ADMIN_PWD) return Response.json({msg:"无权限"},{status:403})
    await env.MSG.put(cfgKey, JSON.stringify({max:Number(max)}))
    return Response.json({ok:true})
  }

  // ========== 新增留言（自动读取上限） ==========
  if(url.pathname === "/msg" && request.method==="POST"){
    const {c,nick}=await request.json()
    // 读取你后台设置的上限
    const cfgRaw = await env.MSG.get(cfgKey)
    const cfg = cfgRaw ? JSON.parse(cfgRaw) : {max:30}

    const oldData=await env.MSG.get(key)
    const list=oldData ? JSON.parse(oldData) : []
    list.push({c,t:new Date().toLocaleString(), nick:nick})
    // 超出上限自动删最早
    if(list.length > cfg.max) list.shift()

    await env.MSG.put(key,JSON.stringify(list))
    return Response.json({ok:true})
  }

  // ========== 删除留言 ==========
  if(url.pathname === "/msg" && request.method==="DELETE"){
    const {idx,nick,text}=await request.json()
    const oldData=await env.MSG.get(key)
    const list=oldData ? JSON.parse(oldData) : []
    const targetMsg = list[idx]
    if(!targetMsg) return Response.json({ok:false,msg:"留言不存在"},{status:400})

    const isAdmin = (nick === ADMIN_NAME) && (text === ADMIN_PWD)
    const isOwner = targetMsg.nick === nick
    if(!isAdmin && !isOwner){
      return Response.json({ok:false,msg:"无权限删除"},{status:403})
    }
    list.splice(idx,1)
    await env.MSG.put(key,JSON.stringify(list))
    return Response.json({ok:true})
  }

  // ========== 获取留言列表 ==========
  if(url.pathname === "/msg" && request.method==="GET"){
    const raw=await env.MSG.get(key)
    return Response.json(raw ? JSON.parse(raw) : [])
  }

  return new Response("404")
}
