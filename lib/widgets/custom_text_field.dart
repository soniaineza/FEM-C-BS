import 'package:flutter/material.dart';

import '../core/constants/app_colors.dart';

/// Reusable decorated text field.
///
/// Handles the password visibility toggle, validation and focus styling
/// through the app theme. Use inside a `Form` with `autovalidateMode`.
class CustomTextField extends StatefulWidget {
  const CustomTextField({
    super.key,
    required this.controller,
    required this.label,
    this.hintText,
    this.validator,
    this.keyboardType,
    this.textInputAction,
    this.obscure = false,
    this.prefixIcon,
    this.maxLines = 1,
    this.onFieldSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final String? hintText;
  final FormFieldValidator<String>? validator;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool obscure;
  final IconData? prefixIcon;
  final int maxLines;
  final ValueChanged<String>? onFieldSubmitted;

  @override
  State<CustomTextField> createState() => _CustomTextFieldState();
}

class _CustomTextFieldState extends State<CustomTextField> {
  late bool _obscured = widget.obscure;

  @override
  void didUpdateWidget(CustomTextField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.obscure != widget.obscure) {
      _obscured = widget.obscure;
    }
  }

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      validator: widget.validator,
      keyboardType: widget.keyboardType,
      textInputAction: widget.textInputAction,
      obscureText: _obscured,
      maxLines: widget.maxLines,
      autocorrect: widget.obscure == false,
      onFieldSubmitted: widget.onFieldSubmitted,
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: widget.hintText,
        prefixIcon: widget.prefixIcon != null
            ? Icon(widget.prefixIcon, size: 22, color: AppColors.secondaryText)
            : null,
        suffixIcon: widget.obscure
            ? IconButton(
                onPressed: () => setState(() => _obscured = !_obscured),
                icon: Icon(
                  _obscured ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                  color: AppColors.secondaryText,
                ),
                tooltip: _obscured ? 'Show password' : 'Hide password',
              )
            : null,
      ),
    );
  }
}