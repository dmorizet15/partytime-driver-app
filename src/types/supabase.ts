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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
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
      cash_collections: {
        Row: {
          amount_collected: number | null
          collected_at: string
          created_at: string
          driver_id: string
          id: string
          stop_id: string
        }
        Insert: {
          amount_collected?: number | null
          collected_at?: string
          created_at?: string
          driver_id: string
          id?: string
          stop_id: string
        }
        Update: {
          amount_collected?: number | null
          collected_at?: string
          created_at?: string
          driver_id?: string
          id?: string
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
      dispatch_stops: {
        Row: {
          actual_departure_at: string | null
          address: string | null
          address_lat: number | null
          address_lng: number | null
          balance_due_amount: number | null
          calculated_eta: string | null
          client_company: string | null
          cod_acknowledged_at: string | null
          cod_acknowledged_by: string | null
          company_name: string | null
          completed_at: string | null
          created_at: string
          customer_cell: string | null
          customer_name: string
          customer_phone: string | null
          dispatch_status: Database["public"]["Enums"]["dispatch_status_enum"]
          dispatcher_notes: string | null
          duplicate_type: string | null
          estimated_minutes: number | null
          id: string
          items: Json | null
          linked_stop_id: string | null
          loaded_at: string | null
          loaded_by: string | null
          no_pickup_needed: boolean
          notes: string | null
          order_end_date: string | null
          order_start_date: string | null
          payment_state: Database["public"]["Enums"]["payment_state_enum"]
          required_pickup_count: number
          reservation_id: string
          route_id: string | null
          route_position: number | null
          scheduled_date: string
          scheduled_time: string | null
          stop_status: string | null
          stop_type: Database["public"]["Enums"]["stop_type_enum"]
          tapgoods_order_token: string | null
          tapgoods_stop_id: string | null
          tapgoods_writeback_at: string | null
          tapgoods_writeback_status: string | null
          updated_at: string
        }
        Insert: {
          actual_departure_at?: string | null
          address?: string | null
          address_lat?: number | null
          address_lng?: number | null
          balance_due_amount?: number | null
          calculated_eta?: string | null
          client_company?: string | null
          cod_acknowledged_at?: string | null
          cod_acknowledged_by?: string | null
          company_name?: string | null
          completed_at?: string | null
          created_at?: string
          customer_cell?: string | null
          customer_name: string
          customer_phone?: string | null
          dispatch_status?: Database["public"]["Enums"]["dispatch_status_enum"]
          dispatcher_notes?: string | null
          duplicate_type?: string | null
          estimated_minutes?: number | null
          id?: string
          items?: Json | null
          linked_stop_id?: string | null
          loaded_at?: string | null
          loaded_by?: string | null
          no_pickup_needed?: boolean
          notes?: string | null
          order_end_date?: string | null
          order_start_date?: string | null
          payment_state: Database["public"]["Enums"]["payment_state_enum"]
          required_pickup_count?: number
          reservation_id: string
          route_id?: string | null
          route_position?: number | null
          scheduled_date: string
          scheduled_time?: string | null
          stop_status?: string | null
          stop_type: Database["public"]["Enums"]["stop_type_enum"]
          tapgoods_order_token?: string | null
          tapgoods_stop_id?: string | null
          tapgoods_writeback_at?: string | null
          tapgoods_writeback_status?: string | null
          updated_at?: string
        }
        Update: {
          actual_departure_at?: string | null
          address?: string | null
          address_lat?: number | null
          address_lng?: number | null
          balance_due_amount?: number | null
          calculated_eta?: string | null
          client_company?: string | null
          cod_acknowledged_at?: string | null
          cod_acknowledged_by?: string | null
          company_name?: string | null
          completed_at?: string | null
          created_at?: string
          customer_cell?: string | null
          customer_name?: string
          customer_phone?: string | null
          dispatch_status?: Database["public"]["Enums"]["dispatch_status_enum"]
          dispatcher_notes?: string | null
          duplicate_type?: string | null
          estimated_minutes?: number | null
          id?: string
          items?: Json | null
          linked_stop_id?: string | null
          loaded_at?: string | null
          loaded_by?: string | null
          no_pickup_needed?: boolean
          notes?: string | null
          order_end_date?: string | null
          order_start_date?: string | null
          payment_state?: Database["public"]["Enums"]["payment_state_enum"]
          required_pickup_count?: number
          reservation_id?: string
          route_id?: string | null
          route_position?: number | null
          scheduled_date?: string
          scheduled_time?: string | null
          stop_status?: string | null
          stop_type?: Database["public"]["Enums"]["stop_type_enum"]
          tapgoods_order_token?: string | null
          tapgoods_stop_id?: string | null
          tapgoods_writeback_at?: string | null
          tapgoods_writeback_status?: string | null
          updated_at?: string
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
      fleet_vehicles: {
        Row: {
          active: boolean | null
          color: string | null
          created_at: string | null
          current_mileage: number | null
          ez_pass_tag: string | null
          gvwr_lbs: number | null
          id: number
          inspection_expiry: string | null
          insurance_expiry: string | null
          lease_or_owned: string | null
          make: string | null
          model: string | null
          notes: string | null
          plate: string | null
          purchase_date: string | null
          registration_expiry: string | null
          truck_key_number: string | null
          updated_at: string | null
          vehicle_name: string
          vehicle_type: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          current_mileage?: number | null
          ez_pass_tag?: string | null
          gvwr_lbs?: number | null
          id?: number
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          lease_or_owned?: string | null
          make?: string | null
          model?: string | null
          notes?: string | null
          plate?: string | null
          purchase_date?: string | null
          registration_expiry?: string | null
          truck_key_number?: string | null
          updated_at?: string | null
          vehicle_name: string
          vehicle_type?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          current_mileage?: number | null
          ez_pass_tag?: string | null
          gvwr_lbs?: number | null
          id?: number
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          lease_or_owned?: string | null
          make?: string | null
          model?: string | null
          notes?: string | null
          plate?: string | null
          purchase_date?: string | null
          registration_expiry?: string | null
          truck_key_number?: string | null
          updated_at?: string | null
          vehicle_name?: string
          vehicle_type?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
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
      route_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role: string
          route_id: string
          staff_name: string | null
          user_id: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: string
          route_id: string
          staff_name?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: string
          route_id?: string
          staff_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_assignments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          break_blocks: Json
          created_at: string
          created_by: string | null
          dispatched_at: string | null
          dispatched_by: string | null
          id: string
          label: string
          route_date: string
          route_number: number | null
          route_start_time: string | null
          status: Database["public"]["Enums"]["route_status_enum"]
          truck_id: string | null
          truck_id_2: string | null
          unload_completed_at: string | null
          unload_started_at: string | null
          updated_at: string
        }
        Insert: {
          break_blocks?: Json
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          label: string
          route_date: string
          route_number?: number | null
          route_start_time?: string | null
          status?: Database["public"]["Enums"]["route_status_enum"]
          truck_id?: string | null
          truck_id_2?: string | null
          unload_completed_at?: string | null
          unload_started_at?: string | null
          updated_at?: string
        }
        Update: {
          break_blocks?: Json
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          label?: string
          route_date?: string
          route_number?: number | null
          route_start_time?: string | null
          status?: Database["public"]["Enums"]["route_status_enum"]
          truck_id?: string | null
          truck_id_2?: string | null
          unload_completed_at?: string | null
          unload_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
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
        ]
      }
      sms_conversations: {
        Row: {
          customer_phone: string
          eta_sent_at: string | null
          last_inbound_processed_at: string | null
          state: string | null
          stop_id: string
          stop_type: string | null
          will_call_order_id: string | null
        }
        Insert: {
          customer_phone: string
          eta_sent_at?: string | null
          last_inbound_processed_at?: string | null
          state?: string | null
          stop_id: string
          stop_type?: string | null
          will_call_order_id?: string | null
        }
        Update: {
          customer_phone?: string
          eta_sent_at?: string | null
          last_inbound_processed_at?: string | null
          state?: string | null
          stop_id?: string
          stop_type?: string | null
          will_call_order_id?: string | null
        }
        Relationships: []
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
          license_plate: string | null
          make: string | null
          model: string | null
          name: string
          notes: string | null
          out_of_service_reason: string | null
          out_of_service_since: string | null
          plate: string | null
          registration_expiry: string | null
          truck_key_number: string | null
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
          license_plate?: string | null
          make?: string | null
          model?: string | null
          name: string
          notes?: string | null
          out_of_service_reason?: string | null
          out_of_service_since?: string | null
          plate?: string | null
          registration_expiry?: string | null
          truck_key_number?: string | null
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
          license_plate?: string | null
          make?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          out_of_service_reason?: string | null
          out_of_service_since?: string | null
          plate?: string | null
          registration_expiry?: string | null
          truck_key_number?: string | null
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
          inspection_id: string
          last_acknowledged_at: string | null
          last_acknowledged_by_user_id: string | null
          overridden_at: string | null
          overridden_by_user_id: string | null
          override_reason: string | null
          reported_at: string
          reported_by_user_id: string
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
          inspection_id: string
          last_acknowledged_at?: string | null
          last_acknowledged_by_user_id?: string | null
          overridden_at?: string | null
          overridden_by_user_id?: string | null
          override_reason?: string | null
          reported_at?: string
          reported_by_user_id: string
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
          inspection_id?: string
          last_acknowledged_at?: string | null
          last_acknowledged_by_user_id?: string | null
          overridden_at?: string | null
          overridden_by_user_id?: string | null
          override_reason?: string | null
          reported_at?: string
          reported_by_user_id?: string
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
          status?: string | null
          tapgoods_rental_id?: string | null
          tapgoods_sync_updated_at?: string | null
          tapgoods_token?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      dispatch_status_enum:
        | "pending"
        | "loaded"
        | "otw"
        | "complete"
        | "cancelled"
      payment_state_enum: "paid_in_full" | "cod" | "ar_customer" | "balance_due"
      route_status_enum: "draft" | "dispatched" | "in_progress" | "complete"
      stop_type_enum: "delivery" | "pickup"
      user_role:
        | "super_admin"
        | "scheduler"
        | "warehouse"
        | "driver"
        | "read_only"
        | "display"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      dispatch_status_enum: [
        "pending",
        "loaded",
        "otw",
        "complete",
        "cancelled",
      ],
      payment_state_enum: ["paid_in_full", "cod", "ar_customer", "balance_due"],
      route_status_enum: ["draft", "dispatched", "in_progress", "complete"],
      stop_type_enum: ["delivery", "pickup"],
      user_role: [
        "super_admin",
        "scheduler",
        "warehouse",
        "driver",
        "read_only",
        "display",
      ],
    },
  },
} as const
A new version of Supabase CLI is available: v2.98.2 (currently installed v2.90.0)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
