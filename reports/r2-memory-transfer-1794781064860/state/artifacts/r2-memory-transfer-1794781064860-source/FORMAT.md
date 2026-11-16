The input is UTF-8 delimited text. The first row is data; there is no special header treatment.
Return an array of rows, each an array of field strings. Empty input returns [].
A quoted field starts and ends with a double quote. It may contain the delimiter, CR/LF newlines and empty text.
Two double quotes inside a quoted field decode to one literal double quote.
Unquoted fields may be empty, including trailing fields. Accept LF and CRLF record separators.
Malformed unterminated quotes, characters after a closing quote, or quotes inside an unquoted field must throw Error('INVALID_FORMAT').
