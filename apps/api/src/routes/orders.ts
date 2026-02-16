import { FastifyInstance } from 'fastify';
import { getSupabaseClient } from '../services/supabase';
import { randomUUID } from 'crypto';

export async function orderRoutes(server: FastifyInstance) {
  // Create a new order (mock purchase)
  server.post('/api/v1/orders', async (request, reply) => {
    const { projectId, candidateId, domainName, tld, priceCents, isPremium } =
      request.body as {
        projectId: string;
        candidateId: string;
        domainName: string;
        tld: string;
        priceCents: number;
        isPremium: boolean;
      };

    const supabase = getSupabaseClient();

    try {
      // Verify project exists
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError || !project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Verify candidate exists
      const { data: candidate, error: candidateError } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', candidateId)
        .single();

      if (candidateError || !candidate) {
        return reply.status(404).send({ error: 'Candidate not found' });
      }

      // Create order
      const order = {
        id: randomUUID(),
        project_id: projectId,
        candidate_id: candidateId,
        user_id: project.user_id,
        domain_name: domainName,
        tld,
        price_cents: priceCents,
        is_premium: isPremium,
        status: 'pending',
        registration_data: {
          mockRegistration: true,
          orderedAt: new Date().toISOString(),
          estimatedCompletionDays: isPremium ? 2 : 1,
        },
      };

      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert(order)
        .select()
        .single();

      if (orderError) {
        return reply.status(500).send({ error: orderError.message });
      }

      // Log order created event
      await supabase.from('events').insert({
        project_id: projectId,
        user_id: project.user_id,
        event_type: 'order_created',
        payload: {
          orderId: newOrder.id,
          domainName: `${domainName}.${tld}`,
          priceCents,
          isPremium,
        },
        success: true,
      });

      // Simulate immediate "processing"
      setTimeout(async () => {
        await supabase
          .from('orders')
          .update({ status: 'completed' })
          .eq('id', newOrder.id);

        await supabase.from('events').insert({
          project_id: projectId,
          user_id: project.user_id,
          event_type: 'order_completed',
          payload: { orderId: newOrder.id },
          success: true,
        });
      }, 2000);

      return reply.status(201).send(newOrder);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // Get all orders for a project
  server.get('/api/v1/projects/:id/orders', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };
    const supabase = getSupabaseClient();

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      return reply.send(data || []);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // Get a specific order
  server.get('/api/v1/orders/:id', async (request, reply) => {
    const { id: orderId } = request.params as { id: string };
    const supabase = getSupabaseClient();

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (error || !data) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      return reply.send(data);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // Cancel an order
  server.post('/api/v1/orders/:id/cancel', async (request, reply) => {
    const { id: orderId } = request.params as { id: string };
    const supabase = getSupabaseClient();

    try {
      // Get order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError || !order) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      // Can only cancel pending or processing orders
      if (order.status !== 'pending' && order.status !== 'processing') {
        return reply
          .status(400)
          .send({ error: `Cannot cancel order with status: ${order.status}` });
      }

      // Update order status
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)
        .select()
        .single();

      if (updateError) {
        return reply.status(500).send({ error: updateError.message });
      }

      // Log cancellation
      await supabase.from('events').insert({
        project_id: order.project_id,
        user_id: order.user_id,
        event_type: 'order_cancelled',
        payload: { orderId },
        success: true,
      });

      return reply.send(updatedOrder);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });
}
