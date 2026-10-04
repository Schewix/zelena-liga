import { logger } from '../logger.js';
import { resolveBody } from './articles/model.js';
import {
requireEditor
} from './editorAuth.js';
import { syncAfterpartyAchievements } from './afterpartyAchievements.js';
import { getSupabaseAdminClient } from './supabaseAdmin.js';
import { parseNonNegativeInt } from './validation.js';

export type AfterpartyOrderStatus = 'pending' | 'approved' | 'rejected';

export type AfterpartyAdminOrderItem = {
  id: string;
  drink_key: string;
  label: string;
  category: string;
  quantity: number;
  approved_quantity: number;
  points_each: number;
  points_total: number;
};

export type AfterpartyAdminOrder = {
  id: string;
  participant_id: string;
  status: AfterpartyOrderStatus;
  receipt_path: string;
  total_points: number;
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  receipt_signed_url?: string | null;
  afterparty_participants?: {
    id: string;
    display_name: string;
    troop_name: string;
  } | null;
  afterparty_order_items?: AfterpartyAdminOrderItem[];
};

export const AFTERPARTY_RECEIPTS_BUCKET = 'afterparty-receipts';

export function parseAfterpartyReviewItems(payload: Record<string, unknown>): Map<string, number> {
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const quantities = new Map<string, number>();
  rawItems.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const id = typeof (entry as any).id === 'string' ? (entry as any).id.trim() : '';
    if (!id) {
      return;
    }
    quantities.set(id, parseNonNegativeInt((entry as any).approved_quantity, 0));
  });
  return quantities;
}

export async function loadAfterpartyAdminOrders(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const { data, error } = await supabase
    .from('afterparty_orders')
    .select(
      'id, participant_id, status, receipt_path, total_points, review_note, submitted_at, reviewed_at, afterparty_participants(id, display_name, troop_name), afterparty_order_items(id, drink_key, label, category, quantity, approved_quantity, points_each, points_total)',
    )
    .order('submitted_at', { ascending: false })
    .limit(200);

  if (error) {
    throw error;
  }

  const statusOrder: Record<AfterpartyOrderStatus, number> = {
    pending: 0,
    approved: 1,
    rejected: 2,
  };

  const orders = ((data ?? []) as unknown as AfterpartyAdminOrder[])
    .map((order) => ({
      ...order,
      afterparty_order_items: [...(order.afterparty_order_items ?? [])].sort(
        (a, b) => a.category.localeCompare(b.category, 'cs') || a.label.localeCompare(b.label, 'cs'),
      ),
    }))
    .sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) {
        return statusDiff;
      }
      return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
    });

  return Promise.all(
    orders.map(async (order) => {
      if (!order.receipt_path) {
        return { ...order, receipt_signed_url: null };
      }
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(AFTERPARTY_RECEIPTS_BUCKET)
        .createSignedUrl(order.receipt_path, 60 * 60);
      if (signedUrlError) {
        logger.error('[api/content/afterparty] failed to create signed URL', signedUrlError);
        return { ...order, receipt_signed_url: null };
      }
      return { ...order, receipt_signed_url: signedUrlData?.signedUrl ?? null };
    }),
  );
}

export async function handleAdminAfterparty(req: any, res: any, segments: string[]) {
  if (!requireEditor(req, res)) {
    return;
  }

  const supabase = getSupabaseAdminClient();
  const [resource, id] = segments;

  if ((segments.length === 0 || resource === 'orders') && req.method === 'GET') {
    try {
      const orders = await loadAfterpartyAdminOrders(supabase);
      res.status(200).json({ orders });
    } catch (error) {
      logger.error('[api/content/admin/afterparty] failed to load orders', error);
      res.status(500).json({ error: 'Failed to load afterparty orders.' });
    }
    return;
  }

  if (resource === 'orders' && id && req.method === 'POST') {
    const payload = resolveBody(req);
    const action = typeof payload.action === 'string' ? payload.action : '';
    const reviewNote = typeof payload.review_note === 'string' ? payload.review_note.trim() : '';

    if (action !== 'approve' && action !== 'reject') {
      res.status(400).json({ error: 'Invalid action.' });
      return;
    }

    try {
      const { data: existingOrder, error: orderLoadError } = await supabase
        .from('afterparty_orders')
        .select('id, participant_id')
        .eq('id', id)
        .maybeSingle();

      if (orderLoadError) {
        throw orderLoadError;
      }
      if (!existingOrder) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }

      const { data: items, error: itemsError } = await supabase
        .from('afterparty_order_items')
        .select('id, quantity, approved_quantity, points_each')
        .eq('order_id', id);

      if (itemsError) {
        throw itemsError;
      }

      if (action === 'reject') {
        const { error: itemsUpdateError } = await supabase
          .from('afterparty_order_items')
          .update({ approved_quantity: 0, points_total: 0 })
          .eq('order_id', id);
        if (itemsUpdateError) {
          throw itemsUpdateError;
        }

        const { error: orderUpdateError } = await supabase
          .from('afterparty_orders')
          .update({
            status: 'rejected',
            total_points: 0,
            review_note: reviewNote || null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: null,
          })
          .eq('id', id);
        if (orderUpdateError) {
          throw orderUpdateError;
        }
        await syncAfterpartyAchievements(supabase, [existingOrder.participant_id]);
        res.status(200).json({ ok: true });
        return;
      }

      const reviewQuantities = parseAfterpartyReviewItems(payload);
      const approvedItems = ((items ?? []) as Array<{
        id: string;
        quantity: number | null;
        approved_quantity: number | null;
        points_each: number | null;
      }>).map((item) => {
        const fallbackQuantity = parseNonNegativeInt(item.approved_quantity ?? item.quantity, 0);
        const approvedQuantity = reviewQuantities.has(item.id)
          ? parseNonNegativeInt(reviewQuantities.get(item.id), fallbackQuantity)
          : fallbackQuantity;
        const pointsEach = parseNonNegativeInt(item.points_each, 0);
        return {
          id: item.id,
          approvedQuantity,
          pointsTotal: approvedQuantity * pointsEach,
        };
      });

      const updateResults = await Promise.all(
        approvedItems.map((item) =>
          supabase
            .from('afterparty_order_items')
            .update({
              approved_quantity: item.approvedQuantity,
              points_total: item.pointsTotal,
            })
            .eq('id', item.id)
            .eq('order_id', id),
        ),
      );
      const updateError = updateResults.find((result) => result.error)?.error;
      if (updateError) {
        throw updateError;
      }

      const totalPoints = approvedItems.reduce((sum, item) => sum + item.pointsTotal, 0);
      const { error: orderUpdateError } = await supabase
        .from('afterparty_orders')
        .update({
          status: 'approved',
          total_points: totalPoints,
          review_note: reviewNote || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: null,
        })
        .eq('id', id);
      if (orderUpdateError) {
        throw orderUpdateError;
      }

      await syncAfterpartyAchievements(supabase, [existingOrder.participant_id]);
      res.status(200).json({ ok: true, total_points: totalPoints });
    } catch (error) {
      logger.error('[api/content/admin/afterparty] failed to review order', error);
      res.status(500).json({ error: 'Failed to review afterparty order.' });
    }
    return;
  }

  if (resource === 'achievements' && req.method === 'POST') {
    try {
      const result = await syncAfterpartyAchievements(supabase);
      res.status(200).json({ ok: true, ...result });
    } catch (error) {
      logger.error('[api/content/admin/afterparty] failed to sync achievements', error);
      res.status(500).json({ error: 'Failed to recompute afterparty achievements.' });
    }
    return;
  }

  if (resource === 'reset' && req.method === 'POST') {
    try {
      const { data: receiptRows, error: receiptError } = await supabase.from('afterparty_orders').select('receipt_path');

      if (receiptError) {
        throw receiptError;
      }

      const receiptPaths = Array.from(
        new Set(
          ((receiptRows ?? []) as Array<{ receipt_path?: string | null }>)
            .map((row) => row.receipt_path?.trim() ?? '')
            .filter(Boolean),
        ),
      );

      for (let index = 0; index < receiptPaths.length; index += 100) {
        const chunk = receiptPaths.slice(index, index + 100);
        const { error: storageError } = await supabase.storage.from(AFTERPARTY_RECEIPTS_BUCKET).remove(chunk);
        if (storageError) {
          throw storageError;
        }
      }

      const { error: itemsDeleteError } = await supabase
        .from('afterparty_order_items')
        .delete()
        .not('id', 'is', null);
      if (itemsDeleteError) {
        throw itemsDeleteError;
      }

      const { error: ordersDeleteError } = await supabase.from('afterparty_orders').delete().not('id', 'is', null);
      if (ordersDeleteError) {
        throw ordersDeleteError;
      }

      const { error: participantsDeleteError } = await supabase
        .from('afterparty_participants')
        .delete()
        .not('id', 'is', null);
      if (participantsDeleteError) {
        throw participantsDeleteError;
      }

      res.status(200).json({ ok: true, deleted_receipts: receiptPaths.length });
    } catch (error) {
      logger.error('[api/content/admin/afterparty] failed to reset league', error);
      res.status(500).json({ error: 'Failed to reset afterparty league.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
