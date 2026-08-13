export async function onRequest({env,request}){
  const key="msgboard"
  // 和前端同步
  const ADMIN_NAME = "管理员"
  const ADMIN_PWD = "xiaojun99"

  if(request.method==="POST"){
    const {c,nick}=await request.json()
    const oldData=await env.MSG.get(key)
    const list=oldData ? JSON.parse(oldData) : []
    list.push({c,t:new Date().toLocaleString(), nick:nick})
    if(list.length>30) list.shift()
    await env.MSG.put(key,JSON.stringify(list))
    return Response.json({ok:true})
  }else if(request.method==="DELETE"){
    const {idx,nick,text}=await request.json()
    const oldData=await env.MSG.get(key)
    const list=oldData ? JSON.parse(oldData) : []
    const targetMsg = list[idx]
    if(!targetMsg) return Response.json({ok:false,msg:"留言不存在"},{status:400})

    //后端校验管理员
    const isAdmin = (nick === ADMIN_NAME) && (text === ADMIN_PWD)
    const isOwner = targetMsg.nick === nick
    if(!isAdmin && !isOwner){
      return Response.json({ok:false,msg:"无权限删除"},{status:403})
    }

    list.splice(idx,1)
    await env.MSG.put(key,JSON.stringify(list))
    return Response.json({ok:true})
  }else{
    const raw=await env.MSG.get(key)
    return Response.json(raw ? JSON.parse(raw) : [])
  }
}