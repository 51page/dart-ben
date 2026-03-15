require 'rexml/document'
require 'json'

# Parse shared strings
doc_str = REXML::Document.new(File.read('data_extracted/xl/sharedStrings.xml'))
strings = []
doc_str.get_elements('//si').each do |si|
  t_elems = si.get_elements('.//t')
  if t_elems.any?
    strings << t_elems.map(&:text).join
  else
    strings << ""
  end
end

# Parse sheet
doc_sht = REXML::Document.new(File.read('data_extracted/xl/worksheets/sheet1.xml'))
data = {}

def parse_money(str)
  return 0.0 unless str
  s = str.to_s.delete(',')
  
  if s.include?('조') || s.include?('억') || s.include?('만')
    val = 0.0
    if s =~ /(-?\d+(?:\.\d+)?)조/
      val += $1.to_f * 1_000_000_000_000
    end
    if s =~ /(-?\d+(?:\.\d+)?)억/
      val += $1.to_f * 100_000_000
    end
    if s =~ /(-?\d+(?:\.\d+)?)만/
      val += $1.to_f * 10_000
    end
    
    # If the minus sign was lost or (손실) is present
    if s.include?('손실') && val > 0 && !(s =~ /^-/)
      val = -val
    end
    return val
  end
  
  s.to_f
end

last_company = nil

doc_sht.get_elements('//row').each do |row|
  row_num = row.attributes['r'].to_i
  next if row_num < 4 # Skip headers
  
  cells = Array.new(10)
  row.get_elements('c').each do |c|
    r_attr = c.attributes['r']
    col_str = r_attr.match(/([A-Z]+)/)[1]
    col_idx = col_str.bytes.first - 'A'.bytes.first
    
    type = c.attributes['t']
    v_el = c.get_elements('v').first
    val = v_el ? v_el.text : nil
    if type == 's' && val
      val = strings[val.to_i]
    end
    cells[col_idx] = val
  end
  
  raw_company = cells[0].to_s.strip
  
  # For merged cells, company cell is empty. Carry over previous valid company.
  if !raw_company.empty?
    last_company = raw_company
  end
  
  company = last_company
  year = cells[1].to_s.strip
  
  rev = parse_money(cells[2])
  prof = parse_money(cells[3])
  
  if company && !company.empty? && year =~ /20\d{2}/
    data[company] ||= {}
    entry = { rev: rev, prof: prof }
    if year == '2025'
      # YoY% is raw float (e.g. 0.4115 for 41.15%), or text
      def parse_yoy(v)
        return nil if v.nil? || v.to_s.strip.empty?
        v.to_f
      end
      
      entry[:rev_yoy] = parse_yoy(cells[4])
      entry[:prof_yoy] = parse_yoy(cells[5])
    end
    data[company][year] = entry
  end
end

File.write('data.js', "window.FINANCIAL_DATA = #{JSON.pretty_generate(data)};")
puts "Parsed successfully!"
