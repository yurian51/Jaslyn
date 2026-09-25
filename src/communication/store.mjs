import { getPool, withTransaction } from "../net/db.mjs";

export async function listConversations(session, { limit = 50 } = {}) {
  const pool = await getPool();
  if (!pool) throw new Error("DATABASE_URL is not configured");
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const { rows } = await pool.query(
    `select c.id,c.type,c.title,c.customer_id,c.last_message_at,c.created_at,c.updated_at,
            coalesce(json_agg(
              json_build_object('userId',m.user_id,'role',m.role,'lastReadAt',m.last_read_at)
              order by m.joined_at
            ) filter (where m.user_id is not null),'[]'::json) as members,
            coalesce((
              select json_build_object('id',msg.id,'body',msg.body,'kind',msg.kind,'senderUserId',msg.sender_user_id,'senderCustomerId',msg.sender_customer_id,'sequence',msg.sequence,'createdAt',msg.created_at)
              from net_messages msg
              where msg.conversation_id=c.id and msg.deleted_at is null
              order by msg.sequence desc limit 1
            ), 'null'::json) as last_message
       from net_conversations c
       join net_conversation_members mine on mine.conversation_id=c.id and mine.user_id=$1 and mine.left_at is null
       left join net_conversation_members m on m.conversation_id=c.id and m.left_at is null
      where c.organization_id=$2 and c.archived_at is null
      group by c.id
      order by coalesce(c.last_message_at,c.updated_at) desc
      limit $3`,
    [session.user_id, session.organization_id, safeLimit]
  );
  return rows;
}

export async function getConversation(session, conversationId, { limit = 100 } = {}) {
  const pool = await getPool();
  if (!pool) throw new Error("DATABASE_URL is not configured");
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const membership = await pool.query(
    `select c.id,c.type,c.title,c.customer_id,c.created_by,c.last_message_at,c.created_at,c.updated_at,m.role,m.last_read_at,m.notifications_enabled
       from net_conversations c
       join net_conversation_members m on m.conversation_id=c.id
      where c.id=$1 and c.organization_id=$2 and m.user_id=$3 and m.left_at is null
      limit 1`,
    [conversationId, session.organization_id, session.user_id]
  );
  if (!membership.rowCount) return null;
  const messages = await pool.query(
    `select msg.id,msg.kind,msg.body,msg.reply_to_message_id,msg.forwarded_from_message_id,msg.edited_at,msg.deleted_at,msg.sequence,msg.created_at,msg.sender_user_id,msg.sender_customer_id,
            coalesce((select json_agg(json_build_object('userId',r.user_id,'reaction',r.reaction)) from net_message_reactions r where r.message_id=msg.id),'[]'::json) as reactions
       from net_messages msg
      where msg.conversation_id=$1 and msg.organization_id=$2
      order by msg.sequence desc limit $3`,
    [conversationId, session.organization_id, safeLimit]
  );
  const members = await pool.query(
    `select m.user_id,m.role,m.joined_at,m.left_at,u.email,u.full_name,u.role as user_role
       from net_conversation_members m
       join net_users u on u.id=m.user_id
      where m.conversation_id=$1 and u.organization_id=$2
      order by m.joined_at`,
    [conversationId, session.organization_id]
  );
  return { ...membership.rows[0], members: members.rows, messages: messages.rows.reverse() };
}

async function assertConversationMember(client, session, conversationId) {
  const result = await client.query(
    `select c.id,c.organization_id,m.role
       from net_conversations c
       join net_conversation_members m on m.conversation_id=c.id and m.user_id=$2 and m.left_at is null
      where c.id=$1 and c.organization_id=$3
      limit 1`,
    [conversationId, session.user_id, session.organization_id]
  );
  if (!result.rowCount) throw new Error("CONVERSATION_NOT_FOUND");
  return result.rows[0];
}

export async function createConversation(session, { type = "DIRECT", title = null, memberUserIds = [], customerId = null }) {
  const allowedTypes = new Set(["DIRECT","GROUP","CHANNEL","SUPPORT","INCIDENT","COMMAND","AI"]);
  if (!allowedTypes.has(type)) throw new Error("INVALID_CONVERSATION_TYPE");
  const uniqueMembers = [...new Set([session.user_id, ...memberUserIds].filter(Boolean))];
  return withTransaction(async (client) => {
    const users = await client.query(
      "select id from net_users where organization_id=$1 and id = any($2::uuid[]) and status='ACTIVE'",
      [session.organization_id, uniqueMembers]
    );
    if (users.rowCount !== uniqueMembers.length) throw new Error("MEMBER_OUTSIDE_ORGANIZATION");
    if (customerId) {
      const customer = await client.query("select 1 from net_customers where id=$1 and organization_id=$2", [customerId, session.organization_id]);
      if (!customer.rowCount) throw new Error("CUSTOMER_NOT_FOUND");
    }
    const conversation = await client.query(
      `insert into net_conversations (organization_id,type,title,customer_id,created_by)
       values ($1,$2,$3,$4,$5)
       returning id,type,title,customer_id,created_by,created_at,updated_at,last_message_at`,
      [session.organization_id, type, title ? String(title).trim().slice(0, 200) : null, customerId || null, session.user_id]
    );
    const id = conversation.rows[0].id;
    for (const userId of uniqueMembers) {
      await client.query(
        "insert into net_conversation_members (conversation_id,user_id,role) values ($1,$2,$3)",
        [id, userId, userId === session.user_id ? "OWNER" : "MEMBER"]
      );
    }
    return conversation.rows[0];
  });
}

export async function createMessage(session, conversationId, { body, kind = "TEXT", replyToMessageId = null, forwardedFromMessageId = null }) {
  const text = String(body ?? "").trim();
  const allowedKinds = new Set(["TEXT","SYSTEM","COMMAND","BOT","AI","POLL"]);
  if (!text || text.length > 20000) throw new Error("MESSAGE_BODY_INVALID");
  if (!allowedKinds.has(kind)) throw new Error("MESSAGE_KIND_INVALID");
  return withTransaction(async (client) => {
    await assertConversationMember(client, session, conversationId);
    if (replyToMessageId) {
      const reply = await client.query(
        "select id from net_messages where id=$1 and conversation_id=$2 and organization_id=$3",
        [replyToMessageId, conversationId, session.organization_id]
      );
      if (!reply.rowCount) throw new Error("REPLY_TARGET_NOT_FOUND");
    }
    if (forwardedFromMessageId) {
      const forwarded = await client.query(
        "select id from net_messages where id=$1 and organization_id=$2",
        [forwardedFromMessageId, session.organization_id]
      );
      if (!forwarded.rowCount) throw new Error("FORWARD_TARGET_NOT_FOUND");
    }
    const sequence = await client.query("select net_next_message_sequence($1) sequence", [conversationId]);
    const result = await client.query(
      `insert into net_messages (organization_id,conversation_id,sender_user_id,kind,body,reply_to_message_id,forwarded_from_message_id,sequence)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning id,conversation_id,sender_user_id,kind,body,reply_to_message_id,forwarded_from_message_id,sequence,created_at,updated_at`,
      [session.organization_id, conversationId, session.user_id, kind, text, replyToMessageId, forwardedFromMessageId, sequence.rows[0].sequence]
    );
    await client.query(
      "update net_conversations set last_message_at=now(),updated_at=now() where id=$1 and organization_id=$2",
      [conversationId, session.organization_id]
    );
    await client.query(
      `insert into net_audit_log (organization_id,actor_id,action,target_type,target_id,correlation_id,after_state)
       values ($1,$2,'MESSAGE_CREATED','MESSAGE',$3,$4,$5::jsonb)`,
      [session.organization_id, session.user_id, result.rows[0].id, cryptoCorrelation(), JSON.stringify({ conversationId, kind })]
    );
    return result.rows[0];
  });
}

export async function markConversationRead(session, conversationId, sequence = null) {
  const pool = await getPool();
  if (!pool) throw new Error("DATABASE_URL is not configured");
  const membership = await pool.query(
    `select 1 from net_conversation_members m join net_conversations c on c.id=m.conversation_id
      where m.conversation_id=$1 and m.user_id=$2 and c.organization_id=$3 and m.left_at is null`,
    [conversationId, session.user_id, session.organization_id]
  );
  if (!membership.rowCount) throw new Error("CONVERSATION_NOT_FOUND");
  if (sequence === null) await pool.query("update net_conversation_members set last_read_at=now() where conversation_id=$1 and user_id=$2", [conversationId, session.user_id]);
  else await pool.query(`update net_conversation_members set last_read_at=(select created_at from net_messages where conversation_id=$1 and sequence=$3) where conversation_id=$1 and user_id=$2`, [conversationId, session.user_id, Number(sequence)]);
  return { ok: true };
}

function cryptoCorrelation() {
  return `comm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
