const { getSupabaseClient } = require("./database.js");

const EXCLUDE_FIELDS = ["created_at", "updated_at", "user_id"];

class AuditLogger {
  /**
   * Get org_id from user's staff profile
   */
  static async getUserOrgId(userId, userToken) {
    try {
      const client = getSupabaseClient(userToken);
      const { data, error } = await client
        .from("staff_profiles")
        .select("org_id")
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        console.warn("Could not fetch org_id for user:", userId);
        return null;
      }

      return data.org_id;
    } catch (error) {
      console.error("Error fetching org_id:", error);
      return null;
    }
  }

  static compareObjects(oldObj, newObj, excludeFields = EXCLUDE_FIELDS) {
    const changes = [];
    const allKeys = new Set([
      ...Object.keys(oldObj || {}),
      ...Object.keys(newObj || {}),
    ]);

    allKeys.forEach((key) => {
      if (excludeFields.includes(key)) return;

      const oldVal = oldObj?.[key];
      const newVal = newObj?.[key];

      if (oldVal !== newVal && !(oldVal == null && newVal == null)) {
        changes.push({
          field_name: key,
          old_value: oldVal?.toString() || null,
          new_value: newVal?.toString() || null,
        });
      }
    });

    return changes;
  }

  static objectToChanges(obj, excludeFields = EXCLUDE_FIELDS) {
    return Object.entries(obj)
      .filter(([key]) => !excludeFields.includes(key))
      .map(([key, value]) => ({
        field_name: key,
        old_value: "",
        new_value: value?.toString() || "",
      }));
  }

  static async log({ userId, tableName, action, changes, userToken }) {
    if (!changes || changes.length === 0) return;

    try {
      const orgId = await this.getUserOrgId(userId, userToken);

      const client = getSupabaseClient(userToken);
      const timestamp = new Date().toISOString();

      const logs = changes.map((change) => ({
        user_id: userId,
        org_id: orgId,
        timestamp: timestamp,
        field_name: change.field_name,
        old_value: change.old_value,
        new_value: change.new_value,
        action_enum: action,
        table_name_enum: tableName,
      }));

      const { error } = await client
        .from("transactions_audit_log")
        .insert(logs);

      if (error) {
        console.error("Audit log failed:", error);
      }
    } catch (error) {
      console.error("Audit logging error:", error);
    }
  }

  /**
   * Generic CREATE with audit
   */
  static async auditCreate({
    tableName,
    data,
    userId,
    userToken,
    idField = "id",
  }) {
    const client = getSupabaseClient(userToken);

    const { data: newRecord, error } = await client
      .from(tableName)
      .insert(data)
      .select()
      .single();

    if (error) throw new Error(`Database error: ${error.message}`);

    const changes = this.objectToChanges(newRecord);
    await this.log({
      userId,
      tableName,
      action: "ADD",
      changes,
      userToken,
    });

    return newRecord;
  }

  /**
   * Generic UPDATE with audit
   */
  static async auditUpdate({
    tableName,
    id,
    updates,
    userId,
    userToken,
    idField = "id",
  }) {
    const client = getSupabaseClient(userToken);

    // Get old data
    const { data: oldRecord, error: selectError } = await client
      .from(tableName)
      .select("*")
      .eq(idField, id)
      .single();

    if (selectError) throw new Error(`Database error: ${selectError.message}`);

    // Update
    const { data: newRecord, error: updateError } = await client
      .from(tableName)
      .update(updates)
      .eq(idField, id)
      .select()
      .single();

    if (updateError) throw new Error(`Database error: ${updateError.message}`);

    const changes = this.compareObjects(oldRecord, newRecord);

    if (changes.length > 0) {
      await this.log({
        userId,
        tableName,
        action: "UPDATE",
        changes,
        userToken,
      });
    }

    return newRecord;
  }

  /**
   * Generic DELETE with audit
   */
  static async auditDelete({
    tableName,
    id,
    userId,
    userToken,
    idField = "id",
  }) {
    const client = getSupabaseClient(userToken);

    // Get old data
    const { data: oldRecord, error: selectError } = await client
      .from(tableName)
      .select("*")
      .eq(idField, id)
      .single();

    if (selectError) throw new Error(`Database error: ${selectError.message}`);

    // Delete
    const { error: deleteError } = await client
      .from(tableName)
      .delete()
      .eq(idField, id);

    if (deleteError) throw new Error(`Database error: ${deleteError.message}`);

    const changes = Object.entries(oldRecord)
      .filter(([key]) => !["created_at", "updated_at", idField].includes(key))
      .map(([key, value]) => ({
        field_name: key,
        old_value: value?.toString() || "",
        new_value: "",
      }));

    await this.log({
      userId,
      tableName,
      action: "DELETE",
      changes,
      userToken,
    });

    return { success: true };
  }
}

module.exports = { AuditLogger };
