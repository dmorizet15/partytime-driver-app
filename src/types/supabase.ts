export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      asset_part_fitments: {
        Row: {
          asset_id: string
          asset_type: string
          created_at: string
          id: string
          notes: string | null
          part_id: string
          position: string | null
        }
        Insert: {
          asset_id: string
          asset_type: string
          created_at?: string
          id?: string
          notes?: string | null
          part_id: string
          position?: string | null
        }
        Update: {
          asset_id?: string
          asset_type?: string
          created_at?: string
          id?: string
          notes?: string | null
          part_id?: string
          position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_part_fitments_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action_type: string
          created_at: string
          device_type: string | null
          entity_id: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
          user_role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          action_type: string
          created_at?: string
          device_type?: string | null
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
          user_role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          action_type?: string
          created_at?: string
          device_type?: string | null
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
          user_role?: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: []
      }
      ava_conversations: {
        Row: {
          answer: string | null
          confidence: string | null
          context_id: string | null
          created_at: string
          driver_id: string
          helpful: boolean | null
          id: string
          needs_review: boolean
          question: string
          surface: string
        }
        Insert: {
          answer?: string | null
          confidence?: string | null
          context_id?: string | null
          created_at?: string
          driver_id: string
          helpful?: boolean | null
          id?: string
          needs_review?: boolean
          question: string
          surface: string
        }
        Update: {
          answer?: string | null
          confidence?: string | null
          context_id?: string | null
          created_at?: string
          driver_id?: string
          helpful?: boolean | null
          id?: string
          needs_review?: boolean
          question?: string
          surface?: string
        }
        Relationships: [
          {
            foreignKeyName: "ava_conversations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ava_stop_notes: {
        Row: {
          address_key: string
          author_id: string | null
          created_at: string
          id: string
          note: string
          photo_urls: string[]
          raw_address: string | null
          updated_at: string
        }
        Insert: {
          address_key: string
          author_id?: string | null
          created_at?: string
          id?: string
          note: string
          photo_urls?: string[]
          raw_address?: string | null
          updated_at?: string
        }
        Update: {
          address_key?: string
          author_id?: string | null
          created_at?: string
          id?: string
          note?: string
          photo_urls?: string[]
          raw_address?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ava_stop_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_compliance: {
        Row: {
          created_at: string
          entity_name: string
          id: string
          interstate_flag: boolean
          mcs150_biennial_month: number | null
          mcs150_biennial_year_parity: string | null
          mcs150_confirmation_number: string | null
          mcs150_last_filed_date: string | null
          mcs150_next_due_date: string | null
          notes: string | null
          power_unit_count_current: number | null
          ucr_base_state: string | null
          ucr_bracket: string | null
          ucr_confirmation_id: string | null
          ucr_fee_paid: boolean
          ucr_filed_date: string | null
          ucr_registration_year: number | null
          updated_at: string
          usdot_number: string
        }
        Insert: {
          created_at?: string
          entity_name: string
          id?: string
          interstate_flag?: boolean
          mcs150_biennial_month?: number | null
          mcs150_biennial_year_parity?: string | null
          mcs150_confirmation_number?: string | null
          mcs150_last_filed_date?: string | null
          mcs150_next_due_date?: string | null
          notes?: string | null
          power_unit_count_current?: number | null
          ucr_base_state?: string | null
          ucr_bracket?: string | null
          ucr_confirmation_id?: string | null
          ucr_fee_paid?: boolean
          ucr_filed_date?: string | null
          ucr_registration_year?: number | null
          updated_at?: string
          usdot_number: string
        }
        Update: {
          created_at?: string
          entity_name?: string
          id?: string
          interstate_flag?: boolean
          mcs150_biennial_month?: number | null
          mcs150_biennial_year_parity?: string | null
          mcs150_confirmation_number?: string | null
          mcs150_last_filed_date?: string | null
          mcs150_next_due_date?: string | null
          notes?: string | null
          power_unit_count_current?: number | null
          ucr_base_state?: string | null
          ucr_bracket?: string | null
          ucr_confirmation_id?: string | null
          ucr_fee_paid?: boolean
          ucr_filed_date?: string | null
          ucr_registration_year?: number | null
          updated_at?: string
          usdot_number?: string
        }
        Relationships: []
      }
      cash_collections: {
        Row: {
          amount_collected: number | null
          collected_at: string
          created_at: string
          driver_id: string
          id: string
          not_collected_reason: string | null
          status: string
          stop_id: string
        }
        Insert: {
          amount_collected?: number | null
          collected_at?: string
          created_at?: string
          driver_id: string
          id?: string
          not_collected_reason?: string | null
          status?: string
          stop_id: string
        }
        Update: {
          amount_collected?: number | null
          collected_at?: string
          created_at?: string
          driver_id?: string
          id?: string
          not_collected_reason?: string | null
          status?: string
          stop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_collections_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_name: string
          company_website: string
          dispatch_email_from: string
          id: number
          ptr_phone_display: string
          ptr_phone_raw: string
          ptr_phone_sms: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_name?: string
          company_website?: string
          dispatch_email_from?: string
          id?: number
          ptr_phone_display?: string
          ptr_phone_raw?: string
          ptr_phone_sms?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_name?: string
          company_website?: string
          dispatch_email_from?: string
          id?: number
          ptr_phone_display?: string
          ptr_phone_raw?: string
          ptr_phone_sms?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      compliance_edit_log: {
        Row: {
          edited_at: string
          edited_by_user_id: string
          field_name: string
          id: string
          new_value: string
          old_value: string | null
          truck_id: string
        }
        Insert: {
          edited_at?: string
          edited_by_user_id: string
          field_name: string
          id?: string
          new_value: string
          old_value?: string | null
          truck_id: string
        }
        Update: {
          edited_at?: string
          edited_by_user_id?: string
          field_name?: string
          id?: string
          new_value?: string
          old_value?: string | null
          truck_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_edit_log_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      defect_acknowledgments: {
        Row: {
          acknowledged_at: string
          acknowledged_by_user_id: string
          acknowledgment_role: string
          defect_id: string
          id: string
          notes: string | null
          route_id: string | null
        }
        Insert: {
          acknowledged_at?: string
          acknowledged_by_user_id: string
          acknowledgment_role: string
          defect_id: string
          id?: string
          notes?: string | null
          route_id?: string | null
        }
        Update: {
          acknowledged_at?: string
          acknowledged_by_user_id?: string
          acknowledgment_role?: string
          defect_id?: string
          id?: string
          notes?: string | null
          route_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defect_acknowledgments_defect_id_fkey"
            columns: ["defect_id"]
            isOneToOne: false
            referencedRelation: "vehicle_defects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_acknowledgments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      dependency_map: {
        Row: {
          active: boolean
          created_at: string
          id: string
          notes: string | null
          quantity_threshold: number
          required_item: string
          required_quantity: number
          trigger_type: string
          trigger_value: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          quantity_threshold?: number
          required_item: string
          required_quantity?: number
          trigger_type: string
          trigger_value?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          quantity_threshold?: number
          required_item?: string
          required_quantity?: number
          trigger_type?: string
          trigger_value?: string | null
        }
        Relationships: []
      }
      dispatch_stop_dispatcher_state: {
        Row: {
          dispatcher_seen_at: string | null
          dispatcher_user_id: string
          manual_rank: number | null
          stop_id: string
        }
        Insert: {
          dispatcher_seen_at?: string | null
          dispatcher_user_id: string
          manual_rank?: number | null
          stop_id: string
        }
        Update: {
          dispatcher_seen_at?: string | null
          dispatcher_user_id?: string
          manual_rank?: number | null
          stop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_stop_dispatcher_state_dispatcher_user_id_fkey"
            columns: ["dispatcher_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_stop_dispatcher_state_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "dispatch_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_stops: {
        Row: {
          actual_departure_at: string | null
          address: string | null
          address_lat: number | null
          address_lng: number | null
          arrived_at: string | null
          balance_due_amount: number | null
          calculated_eta: string | null
          client_company: string | null
          cod_acknowledged_at: string | null
          cod_acknowledged_by: string | null
          company_name: string | null
          completed_at: string | null
          constraint_confidence: string | null
          created_at: string
          customer_cell: string | null
          customer_confirmed: boolean
          customer_confirmed_at: string | null
          customer_confirmed_channel: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          customer_reply_intent: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_window_end: string | null
          delivery_window_start: string | null
          dispatch_status: Database["public"]["Enums"]["dispatch_status_enum"]
          dispatcher_constraint_dismissed: boolean
          dispatcher_notes: string | null
          dispatcher_time_override: Json | null
          duplicate_type: string | null
          estimated_minutes: number | null
          event_end: string | null
          event_start: string | null
          geocode_attempted_at: string | null
          geocoded_at: string | null
          has_any_constraint: boolean
          has_structured_constraints: boolean
          id: string
          items: Json | null
          linked_stop_id: string | null
          loaded_at: string | null
          loaded_by: string | null
          no_pickup_needed: boolean
          notes: string | null
          notes_additional_delivery: string | null
          notes_additional_order: string | null
          notes_classification: Json | null
          notes_classification_at: string | null
          notes_classification_version: string | null
          notes_employee_authored: string | null
          notes_flip: string | null
          notes_hash: string | null
          notes_preferred_delivery: Json | null
          notes_preferred_pickup: Json | null
          notes_set_by_time: string | null
          notes_strike_time: string | null
          notification_sent: boolean
          notification_sent_at: string | null
          order_end_date: string | null
          order_start_date: string | null
          order_status: string | null
          payment_state:
            | Database["public"]["Enums"]["payment_state_enum"]
            | null
          pickup_window_end: string | null
          pickup_window_start: string | null
          required_pickup_count: number
          reservation_id: string | null
          route_id: string | null
          route_position: number | null
          scheduled_date: string
          scheduled_time: string | null
          sms_override_phone: string | null
          stop_status: string | null
          stop_type: Database["public"]["Enums"]["stop_type_enum"]
          sync_date_updated_at: string | null
          sync_prev_scheduled_date: string | null
          tapgoods_discrepancy_emailed_at: string | null
          tapgoods_order_token: string | null
          tapgoods_stop_id: string | null
          tapgoods_writeback_at: string | null
          tapgoods_writeback_status: string | null
          tg_date_drift_detected_at: string | null
          tg_date_drift_value: string | null
          updated_at: string
          warehouse_notes: string | null
        }
        Insert: {
          actual_departure_at?: string | null
          address?: string | null
          address_lat?: number | null
          address_lng?: number | null
          arrived_at?: string | null
          balance_due_amount?: number | null
          calculated_eta?: string | null
          client_company?: string | null
          cod_acknowledged_at?: string | null
          cod_acknowledged_by?: string | null
          company_name?: string | null
          completed_at?: string | null
          constraint_confidence?: string | null
          created_at?: string
          customer_cell?: string | null
          customer_confirmed?: boolean
          customer_confirmed_at?: string | null
          customer_confirmed_channel?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_reply_intent?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_window_end?: string | null
          delivery_window_start?: string | null
          dispatch_status?: Database["public"]["Enums"]["dispatch_status_enum"]
          dispatcher_constraint_dismissed?: boolean
          dispatcher_notes?: string | null
          dispatcher_time_override?: Json | null
          duplicate_type?: string | null
          estimated_minutes?: number | null
          event_end?: string | null
          event_start?: string | null
          geocode_attempted_at?: string | null
          geocoded_at?: string | null
          has_any_constraint?: boolean
          has_structured_constraints?: boolean
          id?: string
          items?: Json | null
          linked_stop_id?: string | null
          loaded_at?: string | null
          loaded_by?: string | null
          no_pickup_needed?: boolean
          notes?: string | null
          notes_additional_delivery?: string | null
          notes_additional_order?: string | null
          notes_classification?: Json | null
          notes_classification_at?: string | null
          notes_classification_version?: string | null
          notes_employee_authored?: string | null
          notes_flip?: string | null
          notes_hash?: string | null
          notes_preferred_delivery?: Json | null
          notes_preferred_pickup?: Json | null
          notes_set_by_time?: string | null
          notes_strike_time?: string | null
          notification_sent?: boolean
          notification_sent_at?: string | null
          order_end_date?: string | null
          order_start_date?: string | null
          order_status?: string | null
          payment_state?:
            | Database["public"]["Enums"]["payment_state_enum"]
            | null
          pickup_window_end?: string | null
          pickup_window_start?: string | null
          required_pickup_count?: number
          reservation_id?: string | null
          route_id?: string | null
          route_position?: number | null
          scheduled_date: string
          scheduled_time?: string | null
          sms_override_phone?: string | null
          stop_status?: string | null
          stop_type: Database["public"]["Enums"]["stop_type_enum"]
          sync_date_updated_at?: string | null
          sync_prev_scheduled_date?: string | null
          tapgoods_discrepancy_emailed_at?: string | null
          tapgoods_order_token?: string | null
          tapgoods_stop_id?: string | null
          tapgoods_writeback_at?: string | null
          tapgoods_writeback_status?: string | null
          tg_date_drift_detected_at?: string | null
          tg_date_drift_value?: string | null
          updated_at?: string
          warehouse_notes?: string | null
        }
        Update: {
          actual_departure_at?: string | null
          address?: string | null
          address_lat?: number | null
          address_lng?: number | null
          arrived_at?: string | null
          balance_due_amount?: number | null
          calculated_eta?: string | null
          client_company?: string | null
          cod_acknowledged_at?: string | null
          cod_acknowledged_by?: string | null
          company_name?: string | null
          completed_at?: string | null
          constraint_confidence?: string | null
          created_at?: string
          customer_cell?: string | null
          customer_confirmed?: boolean
          customer_confirmed_at?: string | null
          customer_confirmed_channel?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_reply_intent?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_window_end?: string | null
          delivery_window_start?: string | null
          dispatch_status?: Database["public"]["Enums"]["dispatch_status_enum"]
          dispatcher_constraint_dismissed?: boolean
          dispatcher_notes?: string | null
          dispatcher_time_override?: Json | null
          duplicate_type?: string | null
          estimated_minutes?: number | null
          event_end?: string | null
          event_start?: string | null
          geocode_attempted_at?: string | null
          geocoded_at?: string | null
          has_any_constraint?: boolean
          has_structured_constraints?: boolean
          id?: string
          items?: Json | null
          linked_stop_id?: string | null
          loaded_at?: string | null
          loaded_by?: string | null
          no_pickup_needed?: boolean
          notes?: string | null
          notes_additional_delivery?: string | null
          notes_additional_order?: string | null
          notes_classification?: Json | null
          notes_classification_at?: string | null
          notes_classification_version?: string | null
          notes_employee_authored?: string | null
          notes_flip?: string | null
          notes_hash?: string | null
          notes_preferred_delivery?: Json | null
          notes_preferred_pickup?: Json | null
          notes_set_by_time?: string | null
          notes_strike_time?: string | null
          notification_sent?: boolean
          notification_sent_at?: string | null
          order_end_date?: string | null
          order_start_date?: string | null
          order_status?: string | null
          payment_state?:
            | Database["public"]["Enums"]["payment_state_enum"]
            | null
          pickup_window_end?: string | null
          pickup_window_start?: string | null
          required_pickup_count?: number
          reservation_id?: string | null
          route_id?: string | null
          route_position?: number | null
          scheduled_date?: string
          scheduled_time?: string | null
          sms_override_phone?: string | null
          stop_status?: string | null
          stop_type?: Database["public"]["Enums"]["stop_type_enum"]
          sync_date_updated_at?: string | null
          sync_prev_scheduled_date?: string | null
          tapgoods_discrepancy_emailed_at?: string | null
          tapgoods_order_token?: string | null
          tapgoods_stop_id?: string | null
          tapgoods_writeback_at?: string | null
          tapgoods_writeback_status?: string | null
          tg_date_drift_detected_at?: string | null
          tg_date_drift_value?: string | null
          updated_at?: string
          warehouse_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_stops_linked_stop_id_fkey"
            columns: ["linked_stop_id"]
            isOneToOne: false
            referencedRelation: "dispatch_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_stops_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_time_cache: {
        Row: {
          cached_at: string
          destination_address: string
          id: string
          origin_address: string
          seconds: number
        }
        Insert: {
          cached_at?: string
          destination_address: string
          id?: string
          origin_address: string
          seconds: number
        }
        Update: {
          cached_at?: string
          destination_address?: string
          id?: string
          origin_address?: string
          seconds?: number
        }
        Relationships: []
      }
      driver_documents: {
        Row: {
          created_at: string
          document_type: string
          driver_id: string
          expiry_date: string
          extraction_method: string
          id: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_type: string
          driver_id: string
          expiry_date: string
          extraction_method?: string
          id?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_type?: string
          driver_id?: string
          expiry_date?: string
          extraction_method?: string
          id?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_documents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      field_work_orders: {
        Row: {
          asset_id: string | null
          asset_name: string
          asset_type: string
          assigned_to_user_id: string
          billing_status: string
          created_at: string
          created_by_user_id: string
          customer_name: string | null
          id: string
          issue_description: string
          notes: string | null
          priority: string
          serial_number: string | null
          status: string
          stop_id: string | null
          tapgoods_order_id: string | null
          tapgoods_order_number: string | null
          updated_at: string
          work_order_number: string
        }
        Insert: {
          asset_id?: string | null
          asset_name: string
          asset_type: string
          assigned_to_user_id: string
          billing_status?: string
          created_at?: string
          created_by_user_id: string
          customer_name?: string | null
          id?: string
          issue_description: string
          notes?: string | null
          priority?: string
          serial_number?: string | null
          status?: string
          stop_id?: string | null
          tapgoods_order_id?: string | null
          tapgoods_order_number?: string | null
          updated_at?: string
          work_order_number: string
        }
        Update: {
          asset_id?: string | null
          asset_name?: string
          asset_type?: string
          assigned_to_user_id?: string
          billing_status?: string
          created_at?: string
          created_by_user_id?: string
          customer_name?: string | null
          id?: string
          issue_description?: string
          notes?: string | null
          priority?: string
          serial_number?: string | null
          status?: string
          stop_id?: string | null
          tapgoods_order_id?: string | null
          tapgoods_order_number?: string | null
          updated_at?: string
          work_order_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_work_orders_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "dispatch_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      flame_certificates: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          manufacturer: string
          notes: string | null
          tent_reference_id: string | null
          tent_size: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          manufacturer: string
          notes?: string | null
          tent_reference_id?: string | null
          tent_size?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          manufacturer?: string
          notes?: string | null
          tent_reference_id?: string | null
          tent_size?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flame_certificates_tent_reference_id_fkey"
            columns: ["tent_reference_id"]
            isOneToOne: false
            referencedRelation: "tent_reference_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_work_orders: {
        Row: {
          asset_id: string
          asset_type: string
          assigned_to_user_id: string | null
          created_at: string
          description: string | null
          id: string
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          source: string
          source_defect_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          asset_type: string
          assigned_to_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          source: string
          source_defect_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          asset_type?: string
          assigned_to_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          source?: string
          source_defect_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_work_orders_source_defect_id_fkey"
            columns: ["source_defect_id"]
            isOneToOne: false
            referencedRelation: "vehicle_defects"
            referencedColumns: ["id"]
          },
        ]
      }
      game_scores: {
        Row: {
          achieved_at: string
          game_type: string
          id: string
          player_id: string
          score: number
        }
        Insert: {
          achieved_at?: string
          game_type: string
          id?: string
          player_id: string
          score: number
        }
        Update: {
          achieved_at?: string
          game_type?: string
          id?: string
          player_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_scores_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_schedules: {
        Row: {
          active: boolean
          asset_id: string
          asset_type: string
          created_at: string
          id: string
          interval_hours: number | null
          interval_miles: number | null
          interval_months: number | null
          last_service_date: string | null
          last_service_hours: number | null
          last_service_mileage: number | null
          next_due_date: string | null
          next_due_hours: number | null
          next_due_miles: number | null
          service_label: string | null
          service_type: string
          updated_at: string
          warning_threshold_days: number | null
          warning_threshold_miles: number | null
        }
        Insert: {
          active?: boolean
          asset_id: string
          asset_type: string
          created_at?: string
          id?: string
          interval_hours?: number | null
          interval_miles?: number | null
          interval_months?: number | null
          last_service_date?: string | null
          last_service_hours?: number | null
          last_service_mileage?: number | null
          next_due_date?: string | null
          next_due_hours?: number | null
          next_due_miles?: number | null
          service_label?: string | null
          service_type: string
          updated_at?: string
          warning_threshold_days?: number | null
          warning_threshold_miles?: number | null
        }
        Update: {
          active?: boolean
          asset_id?: string
          asset_type?: string
          created_at?: string
          id?: string
          interval_hours?: number | null
          interval_miles?: number | null
          interval_months?: number | null
          last_service_date?: string | null
          last_service_hours?: number | null
          last_service_mileage?: number | null
          next_due_date?: string | null
          next_due_hours?: number | null
          next_due_miles?: number | null
          service_label?: string | null
          service_type?: string
          updated_at?: string
          warning_threshold_days?: number | null
          warning_threshold_miles?: number | null
        }
        Relationships: []
      }
      non_truck_assets: {
        Row: {
          active: boolean
          asset_type: string
          created_at: string
          current_hours: number | null
          engine_code: string | null
          id: string
          make: string | null
          model: string | null
          name: string
          notes: string | null
          serial_number: string | null
          tapgoods_product_id: string | null
          unit_label: string | null
          unit_number: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          active?: boolean
          asset_type: string
          created_at?: string
          current_hours?: number | null
          engine_code?: string | null
          id?: string
          make?: string | null
          model?: string | null
          name: string
          notes?: string | null
          serial_number?: string | null
          tapgoods_product_id?: string | null
          unit_label?: string | null
          unit_number?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          active?: boolean
          asset_type?: string
          created_at?: string
          current_hours?: number | null
          engine_code?: string | null
          id?: string
          make?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          serial_number?: string | null
          tapgoods_product_id?: string | null
          unit_label?: string | null
          unit_number?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      part_cross_references: {
        Row: {
          brand: string
          created_at: string
          id: string
          part_id: string
          part_number: string
          priority: number
          source_url: string | null
          verified_date: string | null
        }
        Insert: {
          brand: string
          created_at?: string
          id?: string
          part_id: string
          part_number: string
          priority?: number
          source_url?: string | null
          verified_date?: string | null
        }
        Update: {
          brand?: string
          created_at?: string
          id?: string
          part_id?: string
          part_number?: string
          priority?: number
          source_url?: string | null
          verified_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_cross_references_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      part_inventory: {
        Row: {
          created_at: string
          id: string
          last_counted_at: string | null
          part_id: string
          qty_on_hand: number
          reorder_at: number | null
          storage_location: string | null
          supplier_name: string | null
          supplier_part_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_counted_at?: string | null
          part_id: string
          qty_on_hand?: number
          reorder_at?: number | null
          storage_location?: string | null
          supplier_name?: string | null
          supplier_part_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_counted_at?: string | null
          part_id?: string
          qty_on_hand?: number
          reorder_at?: number | null
          storage_location?: string | null
          supplier_name?: string | null
          supplier_part_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_inventory_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          category: string
          created_at: string
          id: string
          notes: string | null
          part_name: string
          updated_at: string
          vmrs_code: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          notes?: string | null
          part_name: string
          updated_at?: string
          vmrs_code?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          part_name?: string
          updated_at?: string
          vmrs_code?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          archived_at: string | null
          archived_by_user_id: string | null
          auto_send_eta: boolean
          checklist_enabled: boolean
          created_at: string
          display_name: string | null
          fleet_maintenance_access: boolean
          id: string
          invited_at: string | null
          invited_by_user_id: string | null
          mobile_number: string | null
          personality_preference: string
          receives_fleet_notifications: boolean
          roles: Database["public"]["Enums"]["user_role"][]
          stats_enabled: boolean
          status: string
          wiw_user_id: number | null
          work_order_technician: boolean
        }
        Insert: {
          archived_at?: string | null
          archived_by_user_id?: string | null
          auto_send_eta?: boolean
          checklist_enabled?: boolean
          created_at?: string
          display_name?: string | null
          fleet_maintenance_access?: boolean
          id: string
          invited_at?: string | null
          invited_by_user_id?: string | null
          mobile_number?: string | null
          personality_preference?: string
          receives_fleet_notifications?: boolean
          roles?: Database["public"]["Enums"]["user_role"][]
          stats_enabled?: boolean
          status?: string
          wiw_user_id?: number | null
          work_order_technician?: boolean
        }
        Update: {
          archived_at?: string | null
          archived_by_user_id?: string | null
          auto_send_eta?: boolean
          checklist_enabled?: boolean
          created_at?: string
          display_name?: string | null
          fleet_maintenance_access?: boolean
          id?: string
          invited_at?: string | null
          invited_by_user_id?: string | null
          mobile_number?: string | null
          personality_preference?: string
          receives_fleet_notifications?: boolean
          roles?: Database["public"]["Enums"]["user_role"][]
          stats_enabled?: boolean
          status?: string
          wiw_user_id?: number | null
          work_order_technician?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_archived_by_user_id_fkey"
            columns: ["archived_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_library_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      reference_library_item_tags: {
        Row: {
          item_id: string
          tag_id: string
        }
        Insert: {
          item_id: string
          tag_id: string
        }
        Update: {
          item_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_library_item_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "reference_library_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_library_item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "reference_library_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_library_items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string
          external_url: string | null
          file_path: string | null
          id: string
          is_public: boolean
          manufacturer_id: string | null
          name: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description: string
          external_url?: string | null
          file_path?: string | null
          id?: string
          is_public?: boolean
          manufacturer_id?: string | null
          name: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string
          external_url?: string | null
          file_path?: string | null
          id?: string
          is_public?: boolean
          manufacturer_id?: string | null
          name?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reference_library_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "reference_library_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_library_items_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "reference_library_manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_library_manufacturers: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      reference_library_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          tag_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tag_type: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tag_type?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          delivery_address: string | null
          delivery_date: string
          delivery_lat: number | null
          delivery_lng: number | null
          id: string
          is_inflatable: boolean
          items: Json | null
          notes: string | null
          payment_state: Database["public"]["Enums"]["payment_state_enum"]
          pickup_date: string | null
          synced_at: string
          tapgoods_data: Json | null
          tapgoods_id: string
          tapgoods_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_date: string
          delivery_lat?: number | null
          delivery_lng?: number | null
          id?: string
          is_inflatable?: boolean
          items?: Json | null
          notes?: string | null
          payment_state?: Database["public"]["Enums"]["payment_state_enum"]
          pickup_date?: string | null
          synced_at?: string
          tapgoods_data?: Json | null
          tapgoods_id: string
          tapgoods_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_date?: string
          delivery_lat?: number | null
          delivery_lng?: number | null
          id?: string
          is_inflatable?: boolean
          items?: Json | null
          notes?: string | null
          payment_state?: Database["public"]["Enums"]["payment_state_enum"]
          pickup_date?: string | null
          synced_at?: string
          tapgoods_data?: Json | null
          tapgoods_id?: string
          tapgoods_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      route_crew: {
        Row: {
          created_at: string | null
          end_time_overridden: boolean
          id: string
          is_primary: boolean
          is_published: boolean
          role: string
          route_id: string
          scheduled_end: string | null
          scheduled_start: string | null
          start_time_overridden: boolean
          truck_id: string | null
          updated_at: string | null
          user_id: string | null
          wiw_job_site_id: number | null
          wiw_position: string
          wiw_shift_id: number | null
          wiw_user_id: number
          wiw_user_name: string
        }
        Insert: {
          created_at?: string | null
          end_time_overridden?: boolean
          id?: string
          is_primary?: boolean
          is_published?: boolean
          role: string
          route_id: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          start_time_overridden?: boolean
          truck_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          wiw_job_site_id?: number | null
          wiw_position: string
          wiw_shift_id?: number | null
          wiw_user_id: number
          wiw_user_name: string
        }
        Update: {
          created_at?: string | null
          end_time_overridden?: boolean
          id?: string
          is_primary?: boolean
          is_published?: boolean
          role?: string
          route_id?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          start_time_overridden?: boolean
          truck_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          wiw_job_site_id?: number | null
          wiw_position?: string
          wiw_shift_id?: number | null
          wiw_user_id?: number
          wiw_user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_crew_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_crew_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_crew_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          active_driver_id: string | null
          actual_departure_at: string | null
          break_blocks: Json
          created_at: string
          created_by: string | null
          dispatched_at: string | null
          dispatched_by: string | null
          dispatcher_notes: string | null
          estimated_return_at: string | null
          id: string
          label: string
          loading_bay: number | null
          loading_bay_2: number | null
          route_date: string
          route_number: number | null
          route_start_time: string | null
          status: Database["public"]["Enums"]["route_status_enum"]
          transfer_pending_to: string | null
          truck_id: string | null
          truck_id_2: string | null
          unload_completed_at: string | null
          unload_started_at: string | null
          updated_at: string
          warehouse_arrived_at: string | null
          warehouse_arrived_by: string | null
          warehouse_notes: string | null
        }
        Insert: {
          active_driver_id?: string | null
          actual_departure_at?: string | null
          break_blocks?: Json
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          dispatcher_notes?: string | null
          estimated_return_at?: string | null
          id?: string
          label: string
          loading_bay?: number | null
          loading_bay_2?: number | null
          route_date: string
          route_number?: number | null
          route_start_time?: string | null
          status?: Database["public"]["Enums"]["route_status_enum"]
          transfer_pending_to?: string | null
          truck_id?: string | null
          truck_id_2?: string | null
          unload_completed_at?: string | null
          unload_started_at?: string | null
          updated_at?: string
          warehouse_arrived_at?: string | null
          warehouse_arrived_by?: string | null
          warehouse_notes?: string | null
        }
        Update: {
          active_driver_id?: string | null
          actual_departure_at?: string | null
          break_blocks?: Json
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          dispatcher_notes?: string | null
          estimated_return_at?: string | null
          id?: string
          label?: string
          loading_bay?: number | null
          loading_bay_2?: number | null
          route_date?: string
          route_number?: number | null
          route_start_time?: string | null
          status?: Database["public"]["Enums"]["route_status_enum"]
          transfer_pending_to?: string | null
          truck_id?: string | null
          truck_id_2?: string | null
          unload_completed_at?: string | null
          unload_started_at?: string | null
          updated_at?: string
          warehouse_arrived_at?: string | null
          warehouse_arrived_by?: string | null
          warehouse_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_active_driver_id_fkey"
            columns: ["active_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_transfer_pending_to_fkey"
            columns: ["transfer_pending_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_truck_id_2_fkey"
            columns: ["truck_id_2"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_warehouse_arrived_by_fkey"
            columns: ["warehouse_arrived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_invoices: {
        Row: {
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          notes: string | null
          service_record_id: string
          uploaded_at: string
          uploaded_by_user_id: string | null
        }
        Insert: {
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          service_record_id: string
          uploaded_at?: string
          uploaded_by_user_id?: string | null
        }
        Update: {
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          service_record_id?: string
          uploaded_at?: string
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_invoices_service_record_id_fkey"
            columns: ["service_record_id"]
            isOneToOne: false
            referencedRelation: "service_records"
            referencedColumns: ["id"]
          },
        ]
      }
      service_line_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          part_id: string | null
          part_number_used: string | null
          qty_used: number | null
          service_record_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          part_id?: string | null
          part_number_used?: string | null
          qty_used?: number | null
          service_record_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          part_id?: string | null
          part_number_used?: string | null
          qty_used?: number | null
          service_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_line_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_line_items_service_record_id_fkey"
            columns: ["service_record_id"]
            isOneToOne: false
            referencedRelation: "service_records"
            referencedColumns: ["id"]
          },
        ]
      }
      service_records: {
        Row: {
          asset_id: string
          asset_type: string
          created_at: string
          hours_at_service: number | null
          id: string
          mileage_at_service: number | null
          notes: string | null
          performed_by_name: string | null
          performed_by_type: string
          performed_by_user_id: string | null
          service_date: string
          service_term_months: number | null
          service_type: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          asset_id: string
          asset_type: string
          created_at?: string
          hours_at_service?: number | null
          id?: string
          mileage_at_service?: number | null
          notes?: string | null
          performed_by_name?: string | null
          performed_by_type: string
          performed_by_user_id?: string | null
          service_date: string
          service_term_months?: number | null
          service_type: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          asset_id?: string
          asset_type?: string
          created_at?: string
          hours_at_service?: number | null
          id?: string
          mileage_at_service?: number | null
          notes?: string | null
          performed_by_name?: string | null
          performed_by_type?: string
          performed_by_user_id?: string | null
          service_date?: string
          service_term_months?: number | null
          service_type?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_records_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_conversations: {
        Row: {
          customer_phone: string
          eta_sent_at: string | null
          last_inbound_processed_at: string | null
          state: string | null
          stop_id: string | null
          stop_type: string | null
          will_call_order_id: string | null
        }
        Insert: {
          customer_phone: string
          eta_sent_at?: string | null
          last_inbound_processed_at?: string | null
          state?: string | null
          stop_id?: string | null
          stop_type?: string | null
          will_call_order_id?: string | null
        }
        Update: {
          customer_phone?: string
          eta_sent_at?: string | null
          last_inbound_processed_at?: string | null
          state?: string | null
          stop_id?: string | null
          stop_type?: string | null
          will_call_order_id?: string | null
        }
        Relationships: []
      }
      sop_entries: {
        Row: {
          content: string
          created_at: string | null
          department: string | null
          effective_date: string | null
          id: string
          last_synced_at: string | null
          notion_page_id: string | null
          sop_number: string
          title: string
          updated_at: string | null
          version: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          department?: string | null
          effective_date?: string | null
          id?: string
          last_synced_at?: string | null
          notion_page_id?: string | null
          sop_number: string
          title: string
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          department?: string | null
          effective_date?: string | null
          id?: string
          last_synced_at?: string | null
          notion_page_id?: string | null
          sop_number?: string
          title?: string
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      stop_item_checkoffs: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          confirmed_qty: number
          created_at: string
          damaged: boolean
          id: string
          item_name: string
          ordered_qty: number
          stop_id: string
          stop_type: Database["public"]["Enums"]["stop_type_enum"]
          tapgoods_pick_list_item_id: number | null
          work_order_id: string | null
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          confirmed_qty: number
          created_at?: string
          damaged?: boolean
          id?: string
          item_name: string
          ordered_qty: number
          stop_id: string
          stop_type: Database["public"]["Enums"]["stop_type_enum"]
          tapgoods_pick_list_item_id?: number | null
          work_order_id?: string | null
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          confirmed_qty?: number
          created_at?: string
          damaged?: boolean
          id?: string
          item_name?: string
          ordered_qty?: number
          stop_id?: string
          stop_type?: Database["public"]["Enums"]["stop_type_enum"]
          tapgoods_pick_list_item_id?: number | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stop_item_checkoffs_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_item_checkoffs_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "dispatch_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_item_checkoffs_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "field_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stops: {
        Row: {
          awaiting_instructions: boolean | null
          customer_instructions: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_ready: boolean | null
          customer_ready_at: string | null
          eta_range: string | null
          eta_sent_at: string | null
          instructions_received_at: string | null
          last_message_at: string | null
          latest_inbound_message: string | null
          not_there_at: string | null
          opted_out: boolean | null
          opted_out_at: string | null
          order_id: string | null
          otw_set_by: string | null
          otw_status: boolean | null
          otw_timestamp: string | null
          pod_photo_url: string | null
          sms_status: string | null
          stop_id: string
          stop_type: string
        }
        Insert: {
          awaiting_instructions?: boolean | null
          customer_instructions?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_ready?: boolean | null
          customer_ready_at?: string | null
          eta_range?: string | null
          eta_sent_at?: string | null
          instructions_received_at?: string | null
          last_message_at?: string | null
          latest_inbound_message?: string | null
          not_there_at?: string | null
          opted_out?: boolean | null
          opted_out_at?: string | null
          order_id?: string | null
          otw_set_by?: string | null
          otw_status?: boolean | null
          otw_timestamp?: string | null
          pod_photo_url?: string | null
          sms_status?: string | null
          stop_id: string
          stop_type: string
        }
        Update: {
          awaiting_instructions?: boolean | null
          customer_instructions?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_ready?: boolean | null
          customer_ready_at?: string | null
          eta_range?: string | null
          eta_sent_at?: string | null
          instructions_received_at?: string | null
          last_message_at?: string | null
          latest_inbound_message?: string | null
          not_there_at?: string | null
          opted_out?: boolean | null
          opted_out_at?: string | null
          order_id?: string | null
          otw_set_by?: string | null
          otw_status?: boolean | null
          otw_timestamp?: string | null
          pod_photo_url?: string | null
          sms_status?: string | null
          stop_id?: string
          stop_type?: string
        }
        Relationships: []
      }
      tapgoods_sync_log: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          orphan_count: number | null
          orphans_rehealed: number | null
          reservations_created: number
          reservations_fetched: number
          reservations_updated: number
          started_at: string
          status: string
          stops_created: number
          triggered_by: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          orphan_count?: number | null
          orphans_rehealed?: number | null
          reservations_created?: number
          reservations_fetched?: number
          reservations_updated?: number
          started_at?: string
          status?: string
          stops_created?: number
          triggered_by?: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          orphan_count?: number | null
          orphans_rehealed?: number | null
          reservations_created?: number
          reservations_fetched?: number
          reservations_updated?: number
          started_at?: string
          status?: string
          stops_created?: number
          triggered_by?: string
        }
        Relationships: []
      }
      tent_drawing_tapgoods_links: {
        Row: {
          created_at: string
          id: string
          tapgoods_product_id: string
          tapgoods_product_name: string | null
          tent_reference_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tapgoods_product_id: string
          tapgoods_product_name?: string | null
          tent_reference_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tapgoods_product_id?: string
          tapgoods_product_name?: string | null
          tent_reference_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tent_drawing_tapgoods_links_tent_reference_item_id_fkey"
            columns: ["tent_reference_item_id"]
            isOneToOne: false
            referencedRelation: "tent_reference_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tent_reference_items: {
        Row: {
          created_at: string
          file_name: string
          id: string
          is_primary: boolean
          manufacturer: string
          notes: string | null
          size: string
          storage_path: string
          tent_type: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          is_primary?: boolean
          manufacturer: string
          notes?: string | null
          size: string
          storage_path: string
          tent_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          is_primary?: boolean
          manufacturer?: string
          notes?: string | null
          size?: string
          storage_path?: string
          tent_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      trucks: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          current_defect_status: string | null
          current_mileage: number | null
          dvir_requirement: string | null
          ez_pass_tag: string | null
          gcwr_lbs: number | null
          gvwr_lbs: number | null
          id: string
          inspection_expiry: string | null
          insurance_expiry: string | null
          make: string | null
          model: string | null
          name: string
          notes: string | null
          out_of_service_reason: string | null
          out_of_service_since: string | null
          plate: string | null
          registration_expiry: string | null
          truck_key_number: string | null
          updated_at: string | null
          vehicle_type: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          current_defect_status?: string | null
          current_mileage?: number | null
          dvir_requirement?: string | null
          ez_pass_tag?: string | null
          gcwr_lbs?: number | null
          gvwr_lbs?: number | null
          id?: string
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          make?: string | null
          model?: string | null
          name: string
          notes?: string | null
          out_of_service_reason?: string | null
          out_of_service_since?: string | null
          plate?: string | null
          registration_expiry?: string | null
          truck_key_number?: string | null
          updated_at?: string | null
          vehicle_type?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          current_defect_status?: string | null
          current_mileage?: number | null
          dvir_requirement?: string | null
          ez_pass_tag?: string | null
          gcwr_lbs?: number | null
          gvwr_lbs?: number | null
          id?: string
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          make?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          out_of_service_reason?: string | null
          out_of_service_since?: string | null
          plate?: string | null
          registration_expiry?: string | null
          truck_key_number?: string | null
          updated_at?: string | null
          vehicle_type?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: []
      }
      vehicle_defects: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          inspection_id: string | null
          last_acknowledged_at: string | null
          last_acknowledged_by_user_id: string | null
          overridden_at: string | null
          overridden_by_user_id: string | null
          override_reason: string | null
          reported_at: string
          reported_by_user_id: string
          reported_context: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          severity: string
          severity_overridden: boolean
          status: string
          truck_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          inspection_id?: string | null
          last_acknowledged_at?: string | null
          last_acknowledged_by_user_id?: string | null
          overridden_at?: string | null
          overridden_by_user_id?: string | null
          override_reason?: string | null
          reported_at?: string
          reported_by_user_id: string
          reported_context?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          severity: string
          severity_overridden?: boolean
          status?: string
          truck_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          inspection_id?: string | null
          last_acknowledged_at?: string | null
          last_acknowledged_by_user_id?: string | null
          overridden_at?: string | null
          overridden_by_user_id?: string | null
          override_reason?: string | null
          reported_at?: string
          reported_by_user_id?: string
          reported_context?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          severity?: string
          severity_overridden?: boolean
          status?: string
          truck_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_defects_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "vehicle_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_defects_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_inspections: {
        Row: {
          coupling_devices_pass: boolean | null
          created_at: string
          driver_id: string
          emergency_equipment_pass: boolean
          horn_pass: boolean
          id: string
          inspection_date: string
          inspection_type: string
          lighting_devices_pass: boolean
          notes: string | null
          parking_brake_pass: boolean
          previous_dvir_acknowledged: boolean
          previous_dvir_reviewed_id: string | null
          rear_vision_mirrors_pass: boolean
          route_id: string | null
          service_brakes_pass: boolean
          signed_at: string
          signed_by_user_id: string
          steering_mechanism_pass: boolean
          tires_pass: boolean
          towing_trailer: boolean
          trailer_brake_connections_pass: boolean | null
          trailer_description: string | null
          truck_id: string
          wheels_and_rims_pass: boolean
          windshield_wipers_pass: boolean
        }
        Insert: {
          coupling_devices_pass?: boolean | null
          created_at?: string
          driver_id: string
          emergency_equipment_pass: boolean
          horn_pass: boolean
          id?: string
          inspection_date?: string
          inspection_type: string
          lighting_devices_pass: boolean
          notes?: string | null
          parking_brake_pass: boolean
          previous_dvir_acknowledged?: boolean
          previous_dvir_reviewed_id?: string | null
          rear_vision_mirrors_pass: boolean
          route_id?: string | null
          service_brakes_pass: boolean
          signed_at?: string
          signed_by_user_id: string
          steering_mechanism_pass: boolean
          tires_pass: boolean
          towing_trailer?: boolean
          trailer_brake_connections_pass?: boolean | null
          trailer_description?: string | null
          truck_id: string
          wheels_and_rims_pass: boolean
          windshield_wipers_pass: boolean
        }
        Update: {
          coupling_devices_pass?: boolean | null
          created_at?: string
          driver_id?: string
          emergency_equipment_pass?: boolean
          horn_pass?: boolean
          id?: string
          inspection_date?: string
          inspection_type?: string
          lighting_devices_pass?: boolean
          notes?: string | null
          parking_brake_pass?: boolean
          previous_dvir_acknowledged?: boolean
          previous_dvir_reviewed_id?: string | null
          rear_vision_mirrors_pass?: boolean
          route_id?: string | null
          service_brakes_pass?: boolean
          signed_at?: string
          signed_by_user_id?: string
          steering_mechanism_pass?: boolean
          tires_pass?: boolean
          towing_trailer?: boolean
          trailer_brake_connections_pass?: boolean | null
          trailer_description?: string | null
          truck_id?: string
          wheels_and_rims_pass?: boolean
          windshield_wipers_pass?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_inspections_previous_dvir_reviewed_id_fkey"
            columns: ["previous_dvir_reviewed_id"]
            isOneToOne: false
            referencedRelation: "vehicle_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_inspections_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_inspections_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          speciality: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          speciality?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          speciality?: string | null
        }
        Relationships: []
      }
      will_call_orders: {
        Row: {
          checkin_window_end: string | null
          checkin_window_start: string | null
          checkout_window_end: string | null
          checkout_window_start: string | null
          company_name: string | null
          created_at: string | null
          customer_cell: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_reply: string | null
          customer_reply_at: string | null
          event_date: string | null
          expected_pickup_date: string | null
          has_discrepancy: boolean | null
          id: string
          items: Json | null
          needs_manual_followup: boolean
          overdue_last_sent_at: string | null
          overdue_reminder_count: number
          payment_state: string | null
          picked_up_at: string | null
          picked_up_by: string | null
          preferred_pickup_window: string | null
          rental_start_date: string | null
          return_notes: string | null
          return_reminder_date: string | null
          return_reminder_error: string | null
          return_reminder_sent_at: string | null
          returned_at: string | null
          returned_by: string | null
          sms_error: string | null
          sms_sent_at: string | null
          staged_at: string | null
          staged_by: string | null
          staged_location: string | null
          status: string | null
          tapgoods_rental_id: string | null
          tapgoods_sync_updated_at: string | null
          tapgoods_token: string | null
          updated_at: string | null
        }
        Insert: {
          checkin_window_end?: string | null
          checkin_window_start?: string | null
          checkout_window_end?: string | null
          checkout_window_start?: string | null
          company_name?: string | null
          created_at?: string | null
          customer_cell?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_reply?: string | null
          customer_reply_at?: string | null
          event_date?: string | null
          expected_pickup_date?: string | null
          has_discrepancy?: boolean | null
          id?: string
          items?: Json | null
          needs_manual_followup?: boolean
          overdue_last_sent_at?: string | null
          overdue_reminder_count?: number
          payment_state?: string | null
          picked_up_at?: string | null
          picked_up_by?: string | null
          preferred_pickup_window?: string | null
          rental_start_date?: string | null
          return_notes?: string | null
          return_reminder_date?: string | null
          return_reminder_error?: string | null
          return_reminder_sent_at?: string | null
          returned_at?: string | null
          returned_by?: string | null
          sms_error?: string | null
          sms_sent_at?: string | null
          staged_at?: string | null
          staged_by?: string | null
          staged_location?: string | null
          status?: string | null
          tapgoods_rental_id?: string | null
          tapgoods_sync_updated_at?: string | null
          tapgoods_token?: string | null
          updated_at?: string | null
        }
        Update: {
          checkin_window_end?: string | null
          checkin_window_start?: string | null
          checkout_window_end?: string | null
          checkout_window_start?: string | null
          company_name?: string | null
          created_at?: string | null
          customer_cell?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_reply?: string | null
          customer_reply_at?: string | null
          event_date?: string | null
          expected_pickup_date?: string | null
          has_discrepancy?: boolean | null
          id?: string
          items?: Json | null
          needs_manual_followup?: boolean
          overdue_last_sent_at?: string | null
          overdue_reminder_count?: number
          payment_state?: string | null
          picked_up_at?: string | null
          picked_up_by?: string | null
          preferred_pickup_window?: string | null
          rental_start_date?: string | null
          return_notes?: string | null
          return_reminder_date?: string | null
          return_reminder_error?: string | null
          return_reminder_sent_at?: string | null
          returned_at?: string | null
          returned_by?: string | null
          sms_error?: string | null
          sms_sent_at?: string | null
          staged_at?: string | null
          staged_by?: string | null
          staged_location?: string | null
          status?: string | null
          tapgoods_rental_id?: string | null
          tapgoods_sync_updated_at?: string | null
          tapgoods_token?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      wiw_token_store: {
        Row: {
          expires_at: string
          id: number
          token: string
          updated_at: string | null
        }
        Insert: {
          expires_at: string
          id?: number
          token: string
          updated_at?: string | null
        }
        Update: {
          expires_at?: string
          id?: number
          token?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      wiw_users_cache: {
        Row: {
          name: string
          positions: string[]
          updated_at: string | null
          wiw_user_id: number
        }
        Insert: {
          name: string
          positions: string[]
          updated_at?: string | null
          wiw_user_id: number
        }
        Update: {
          name?: string
          positions?: string[]
          updated_at?: string | null
          wiw_user_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_warehouse_return_for_route: {
        Args: { p_route_id: string }
        Returns: undefined
      }
      has_fleet_maintenance_access: { Args: never; Returns: boolean }
      is_scheduler_or_super_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      dispatch_status_enum:
        | "pending"
        | "loaded"
        | "otw"
        | "complete"
        | "cancelled"
        | "cancelled_in_tg"
      payment_state_enum:
        | "paid_in_full"
        | "cod"
        | "ar_customer"
        | "balance_due"
        | "credit"
      route_status_enum: "draft" | "dispatched" | "in_progress" | "complete"
      stop_type_enum: "delivery" | "pickup" | "warehouse_return"
      user_role:
        | "super_admin"
        | "scheduler"
        | "warehouse"
        | "driver"
        | "read_only"
        | "display"
        | "maintenance_manager"
        | "will_call"
        | "tools_only"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      dispatch_status_enum: [
        "pending",
        "loaded",
        "otw",
        "complete",
        "cancelled",
        "cancelled_in_tg",
      ],
      payment_state_enum: [
        "paid_in_full",
        "cod",
        "ar_customer",
        "balance_due",
        "credit",
      ],
      route_status_enum: ["draft", "dispatched", "in_progress", "complete"],
      stop_type_enum: ["delivery", "pickup", "warehouse_return"],
      user_role: [
        "super_admin",
        "scheduler",
        "warehouse",
        "driver",
        "read_only",
        "display",
        "maintenance_manager",
        "will_call",
        "tools_only",
      ],
    },
  },
} as const
