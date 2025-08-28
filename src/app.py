from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime, timedelta
import json

app = Flask(__name__)
CORS(app)


try:
    scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
    creds = ServiceAccountCredentials.from_json_keyfile_name(r'src\linen-cubist-470308-m7-b76d822add44.json', scope)
    client = gspread.authorize(creds)
    
    # Replace with your Google Sheets ID
    SPREADSHEET_ID = '1_Ik_4LfPFLbjD_wuef4GEhdl73KVAmxPjIN2jVj0ccE'
    sheet = client.open_by_key(SPREADSHEET_ID)
    print("✅ Google Sheets connection established successfully")
except Exception as e:
    print(f"❌ Error connecting to Google Sheets: {e}")
    print("⚠️ Application will run with limited functionality")
    sheet = None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/rooms')
def get_rooms():
    try:
        if sheet is None:
            
            return jsonify([
                {
                    "Room_Type": "Standard",
                    "Max_Occupancy": 2,
                    "Base_Price": 150,
                    "Description": "Comfortable standard room with modern amenities",
                    "Image_URL": "standard-room.jpg"
                },
                {
                    "Room_Type": "Deluxe",
                    "Max_Occupancy": 3,
                    "Base_Price": 200,
                    "Description": "Spacious deluxe room with premium features",
                    "Image_URL": "deluxe-room.jpg"
                },
                {
                    "Room_Type": "Suite",
                    "Max_Occupancy": 4,
                    "Base_Price": 300,
                    "Description": "Luxurious suite with separate living area",
                    "Image_URL": "suite-room.jpg"
                }
            ])
        
        rooms_sheet = sheet.worksheet('Rooms')
        rooms_data = rooms_sheet.get_all_records()
        return jsonify(rooms_data)
    except Exception as e:
        print(f"Error in get_rooms: {e}")
        # Return mock data as fallback
        return jsonify([
            {
                "Room_Type": "Standard",
                "Max_Occupancy": 2,
                "Base_Price": 150,
                "Description": "Comfortable standard room with modern amenities",
                "Image_URL": ""
            },
            {
                "Room_Type": "Deluxe",
                "Max_Occupancy": 3,
                "Base_Price": 200,
                "Description": "Spacious deluxe room with premium features",
                "Image_URL": ""
            },
            {
                "Room_Type": "Suite",
                "Max_Occupancy": 4,
                "Base_Price": 300,
                "Description": "Luxurious suite with separate living area",
                "Image_URL": ""
            }
        ])

@app.route('/api/pricing', methods=['POST'])
def get_pricing():
    try:
        data = request.json
        check_in = data.get('check_in')
        check_out = data.get('check_out')
        
        if sheet is None:
            
            check_in_date = datetime.strptime(check_in, '%Y-%m-%d')
            check_out_date = datetime.strptime(check_out, '%Y-%m-%d')
            
            mock_pricing = []
            current_date = check_in_date
            while current_date < check_out_date:
                for room_type in ['Standard', 'Deluxe', 'Suite']:
                    base_rates = {'Standard': 150, 'Deluxe': 200, 'Suite': 300}
                    mock_pricing.append({
                        'Date': current_date.strftime('%Y-%m-%d'),
                        'Room_Type': room_type,
                        'Single_Rate': int(base_rates[room_type] * 0.7),
                        'Double_Rate': base_rates[room_type],
                        'Extra_Person': 50,
                        'With_Breakfast': 25,
                        'Available_Rooms': 5
                    })
                current_date += timedelta(days=1)
            return jsonify(mock_pricing)
        
        pricing_sheet = sheet.worksheet('Pricing')
        pricing_data = pricing_sheet.get_all_records()
        
        
        filtered_pricing = []
        check_in_date = datetime.strptime(check_in, '%Y-%m-%d')
        check_out_date = datetime.strptime(check_out, '%Y-%m-%d')
        
        for row in pricing_data:
            try:
                
                date_str = str(row.get('Date', ''))
                if not date_str:
                    continue
                    
               
                try:
                    row_date = datetime.strptime(date_str, '%Y-%m-%d')
                except ValueError:
                    try:
                        row_date = datetime.strptime(date_str, '%m/%d/%Y')
                    except ValueError:
                        try:
                            row_date = datetime.strptime(date_str, '%d/%m/%Y')
                        except ValueError:
                            print(f"Could not parse date: {date_str}")
                            continue
                
                if check_in_date <= row_date < check_out_date:
                   
                    if 'Room_Type' in row:
                        room_type = row['Room_Type']
                        if room_type and room_type.lower() == 'delux':
                            row['Room_Type'] = 'Deluxe'
                        elif room_type and room_type.lower() == 'standard':
                            row['Room_Type'] = 'Standard'
                        elif room_type and room_type.lower() == 'suite':
                            row['Room_Type'] = 'Suite'
                    
                    filtered_pricing.append(row)
                    
            except Exception as e:
                print(f"Error processing row: {row}, Error: {e}")
                continue
        
        return jsonify(filtered_pricing)
    except Exception as e:
        print(f"Error in get_pricing: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/availability', methods=['POST'])
def check_availability():
    try:
        data = request.json
        check_in = data.get('check_in')
        check_out = data.get('check_out')
        
        if sheet is None:
            
            return jsonify({
                'Standard': 5,
                'Deluxe': 3,
                'Suite': 2
            })
        
        pricing_sheet = sheet.worksheet('Pricing')
        pricing_data = pricing_sheet.get_all_records()
        
        
        availability = {}
        check_in_date = datetime.strptime(check_in, '%Y-%m-%d')
        check_out_date = datetime.strptime(check_out, '%Y-%m-%d')
        
        for row in pricing_data:
            try:
               
                date_str = str(row.get('Date', ''))
                if not date_str:
                    continue
                    
            
                try:
                    row_date = datetime.strptime(date_str, '%Y-%m-%d')
                except ValueError:
                    try:
                        row_date = datetime.strptime(date_str, '%m/%d/%Y')
                    except ValueError:
                        try:
                            row_date = datetime.strptime(date_str, '%d/%m/%Y')
                        except ValueError:
                            print(f"Could not parse date: {date_str}")
                            continue
                
                if check_in_date <= row_date < check_out_date:
                    room_type = row.get('Room_Type')
                    available_rooms = row.get('Available_Rooms', 0)
                    
                    
                    if room_type:
                      
                        if room_type.lower() == 'delux':
                            room_type = 'Deluxe'
                        elif room_type.lower() == 'standard':
                            room_type = 'Standard'
                        elif room_type.lower() == 'suite':
                            room_type = 'Suite'
                    
                    if room_type:
                        if room_type not in availability:
                            availability[room_type] = available_rooms
                        else:
                            availability[room_type] = min(availability[room_type], available_rooms)
                            
            except Exception as e:
                print(f"Error processing availability row: {row}, Error: {e}")
                continue
        
       
        if not availability or all(count == 0 for count in availability.values()):
            availability = {'Standard': 5, 'Deluxe': 3, 'Suite': 2}
        
        return jsonify(availability)
    except Exception as e:
        print(f"Error in check_availability: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/calculate-price', methods=['POST'])
def calculate_price():
    try:
        data = request.json
        check_in = data.get('check_in')
        check_out = data.get('check_out')
        room_type = data.get('room_type')
        adults = int(data.get('adults', 1))
        breakfast = data.get('breakfast', False)
        
        if sheet is None:
           
            check_in_date = datetime.strptime(check_in, '%Y-%m-%d')
            check_out_date = datetime.strptime(check_out, '%Y-%m-%d')
            nights = (check_out_date - check_in_date).days
            
            base_rates = {'Standard': 150, 'Deluxe': 200, 'Suite': 300}
            base_price = base_rates.get(room_type, 150)
            
            if adults == 1:
                night_price = int(base_price * 0.7)
            else:
                night_price = base_price
                if adults > 2:
                    night_price += (adults - 2) * 50
            
            total_price = night_price * nights
            if breakfast:
                total_price += nights * 25
                
            return jsonify({
                'total_price': total_price,
                'nights': nights,
                'price_per_night': total_price / nights if nights > 0 else 0
            })
        
        pricing_sheet = sheet.worksheet('Pricing')
        pricing_data = pricing_sheet.get_all_records()
        
        total_price = 0
        check_in_date = datetime.strptime(check_in, '%Y-%m-%d')
        check_out_date = datetime.strptime(check_out, '%Y-%m-%d')
        nights = (check_out_date - check_in_date).days
        
        for row in pricing_data:
            try:
                
                date_str = str(row.get('Date', ''))
                if not date_str:
                    continue
                    
                
                try:
                    row_date = datetime.strptime(date_str, '%Y-%m-%d')
                except ValueError:
                    try:
                        row_date = datetime.strptime(date_str, '%m/%d/%Y')
                    except ValueError:
                        try:
                            row_date = datetime.strptime(date_str, '%d/%m/%Y')
                        except ValueError:
                            print(f"Could not parse date: {date_str}")
                            continue
                
                if (check_in_date <= row_date < check_out_date and 
                    row.get('Room_Type') == room_type):
                    
                   
                    if adults == 1:
                        night_price = row.get('Single_Rate', 100)
                    else:
                        night_price = row.get('Double_Rate', 150)
                        if adults > 2:
                            night_price += (adults - 2) * row.get('Extra_Person', 50)
                    
                    if breakfast:
                        night_price += row.get('With_Breakfast', 25)
                    
                    total_price += night_price
                    
            except Exception as e:
                print(f"Error processing pricing row: {row}, Error: {e}")
                continue
        
        
        if total_price == 0:
            base_rates = {'Standard': 150, 'Deluxe': 200, 'Suite': 300}
            base_price = base_rates.get(room_type, 150)
            
            if adults == 1:
                night_price = int(base_price * 0.7)
            else:
                night_price = base_price
                if adults > 2:
                    night_price += (adults - 2) * 50
            
            total_price = night_price * nights
            if breakfast:
                total_price += nights * 25
        
        return jsonify({
            'total_price': total_price,
            'nights': nights,
            'price_per_night': total_price / nights if nights > 0 else 0
        })
    except Exception as e:
        print(f"Error in calculate_price: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/book', methods=['POST'])
def make_booking():
    try:
        data = request.json
        bookings_sheet = sheet.worksheet('Bookings')
        
       
        existing_bookings = bookings_sheet.get_all_records()
        booking_id = len(existing_bookings) + 1
        
       
        booking_data = [
            booking_id,
            data.get('guest_name'),
            data.get('email'),
            data.get('phone'),
            data.get('check_in'),
            data.get('check_out'),
            data.get('room_type'),
            data.get('adults'),
            data.get('breakfast', False),
            data.get('total_amount'),
            'Confirmed'
        ]
        
        bookings_sheet.append_row(booking_data)
        
        return jsonify({
            'success': True,
            'booking_id': booking_id,
            'message': 'Booking confirmed successfully!'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
